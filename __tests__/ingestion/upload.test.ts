import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { disconnectPrisma, getPrisma } from '@/lib/prisma';
import { seedReferenceData } from '../../prisma/seed';

const mockAfterState: { pending: Array<Promise<unknown>> } = { pending: [] };

jest.mock('next/server', () => {
  const actual = jest.requireActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: (callback: () => unknown) => {
      mockAfterState.pending.push(Promise.resolve().then(callback));
    },
  };
});

const databaseFile = path.resolve(process.cwd(), '.test-db/upload.db');
process.env.DATABASE_URL = `file:${databaseFile}`;

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function flushAfter(): Promise<void> {
  for (let attempt = 0; attempt < 5 && mockAfterState.pending.length > 0; attempt += 1) {
    const batch = mockAfterState.pending.splice(0, mockAfterState.pending.length);
    await Promise.all(batch);
  }
}

describe('bill upload', () => {
  let db: PrismaClient;
  let upload: (request: Request) => Promise<Response>;
  let example: (request: Request) => Promise<Response>;
  let status: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    fs.rmSync(databaseFile, { force: true });
    fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
    execFileSync(path.join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${databaseFile}` },
      stdio: 'pipe',
    });
    upload = (await import('@/app/api/uploads/route')).POST;
    example = (await import('@/app/api/uploads/example/route')).POST;
    status = (await import('@/app/api/documents/[id]/status/route')).GET;
    db = getPrisma();
    await seedReferenceData(db);
  }, 60_000);

  afterAll(async () => {
    await disconnectPrisma();
    delete process.env.DATABASE_URL;
    fs.rmSync(databaseFile, { force: true });
    fs.rmSync(`${databaseFile}-journal`, { force: true });
  });

  it('stores an uploaded photo and reports the unread result', async () => {
    const form = new FormData();
    form.set('file', new File([png], 'receipt.png', { type: 'image/png' }));
    const response = await upload(new Request('http://localhost/api/uploads', { method: 'POST', body: form }));
    await flushAfter();

    expect(response.status).toBe(200);
    const body = (await response.json()) as { documents: Array<{ documentId: number; result: string }> };
    const saved = body.documents[0];
    expect(saved?.result).toBe('created');

    const row = await db.document.findUnique({ where: { id: saved?.documentId } });
    expect(row?.senderIdentifier).toBe('billing@alfanar-fuel.com.sa');
    expect(row?.status).toBe('UNMATCHED');
    expect(row?.statusReason).toBe('UNKNOWN_DOCUMENT');
    expect(row?.externalId.startsWith('upload-')).toBe(true);

    const progress = await status(new Request('http://localhost/api/documents/1/status'), {
      params: Promise.resolve({ id: String(saved?.documentId) }),
    });
    expect(progress.status).toBe(200);
    const view = (await progress.json()) as { phase: string; status: string; preview: boolean };
    expect(view.phase).toBe('done');
    expect(view.status).toBe('UNMATCHED');
    expect(view.preview).toBe(true);
  });

  it('rejects a file that is not a bill', async () => {
    const form = new FormData();
    form.set('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    const response = await upload(new Request('http://localhost/api/uploads', { method: 'POST', body: form }));
    expect(response.status).toBe(400);
    expect(await db.document.count()).toBe(1);
  });

  it('stores a demo invoice once and treats the second upload as a duplicate', async () => {
    const request = () =>
      example(
        new Request('http://localhost/api/uploads/example', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ example: 'harbor-sar' }),
        }),
      );

    const first = await request();
    await flushAfter();
    expect(first.status).toBe(200);
    const created = (await first.json()) as { documents: Array<{ result: string }> };
    expect(created.documents[0]?.result).toBe('created');

    const second = await request();
    await flushAfter();
    const duplicate = (await second.json()) as { documents: Array<{ result: string }> };
    expect(duplicate.documents[0]?.result).toBe('duplicate');
    expect(await db.document.count({ where: { filename: 'harbor-coffee-sar.png' } })).toBe(1);
  });

  it('rejects an unknown example', async () => {
    const response = await example(
      new Request('http://localhost/api/uploads/example', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ example: 'eur-invoice' }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
