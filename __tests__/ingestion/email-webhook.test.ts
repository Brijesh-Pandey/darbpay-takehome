import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { loadFixtureCatalog } from '@/lib/extraction/fixtures';
import { sha256Hex } from '@/lib/extraction/hash';
import { UNKNOWN_EXTRACTION, type DocumentExtractor, type ExtractedDocument } from '@/lib/extraction/types';
import { disconnectPrisma, getPrisma } from '@/lib/prisma';
import { processDocument } from '@/lib/services/document-processing';
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

const databaseFile = path.resolve(process.cwd(), '.test-db/email-webhook.db');
process.env.DATABASE_URL = `file:${databaseFile}`;

const catalog = loadFixtureCatalog();
const fromAlfanar = 'billing@alfanar-fuel.com.sa';
const fromRedSea = 'billing@redsea-haulage.example';

function fixtureBytes(name: string): Buffer {
  const found = catalog.find((item) => item.name === name);
  if (found === undefined) throw new Error(`Missing fixture ${name}`);
  return found.bytes;
}

function emailRequest(body: unknown, raw?: string): Request {
  return new Request('http://localhost/api/webhooks/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}

function payload(messageId: string, from: string, bytes: Buffer | Buffer[], contentType = 'application/pdf') {
  const files = Array.isArray(bytes) ? bytes : [bytes];
  return {
    messageId,
    from,
    to: 'receipts@darb.example.com',
    subject: 'Tax Invoice #INV-99812',
    receivedAt: '2025-06-14T09:21:00Z',
    attachments: files.map((file, index) => ({
      filename: `invoice-${index}.pdf`,
      contentType,
      contentBase64: file.toString('base64'),
    })),
  };
}

async function flushAfter(): Promise<void> {
  for (let attempt = 0; attempt < 5 && mockAfterState.pending.length > 0; attempt += 1) {
    const batch = mockAfterState.pending.splice(0, mockAfterState.pending.length);
    await Promise.all(batch);
  }
}

describe('email webhook', () => {
  let db: PrismaClient;
  let POST: (request: Request) => Promise<Response>;
  let handleEmailPost: typeof import('@/app/api/webhooks/email/route').handleEmailPost;

  beforeAll(async () => {
    fs.rmSync(databaseFile, { force: true });
    fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
    execFileSync(path.join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${databaseFile}` },
      stdio: 'pipe',
    });
    const route = await import('@/app/api/webhooks/email/route');
    POST = route.POST;
    handleEmailPost = route.handleEmailPost;
    db = getPrisma();
    await seedReferenceData(db);
    const listed = await db.$queryRaw<Array<{ file: string }>>`PRAGMA database_list`;
    expect(path.resolve(listed[0]?.file ?? '')).toBe(databaseFile);
  }, 60_000);

  afterAll(async () => {
    await disconnectPrisma();
    delete process.env.DATABASE_URL;
    fs.rmSync(databaseFile, { force: true });
    fs.rmSync(`${databaseFile}-journal`, { force: true });
  });

  async function post(body: unknown, raw?: string): Promise<Response> {
    const response = await POST(emailRequest(body, raw));
    await flushAfter();
    return response;
  }

  it('rejects malformed JSON and stores nothing', async () => {
    const before = await db.document.count();
    const response = await post({}, '{');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'INVALID_JSON' });
    expect(await db.document.count()).toBe(before);
  });

  it('rejects a payload that is missing the sender', async () => {
    const before = await db.document.count();
    const body = payload('msg_missing_from', fromAlfanar, fixtureBytes('exact-alfanar'));
    const rest: Record<string, unknown> = { ...body };
    delete rest.from;
    const response = await post(rest);
    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: string; issues: Array<{ path: string }> };
    expect(json.error).toBe('INVALID_PAYLOAD');
    expect(json.issues.some((issue) => issue.path === 'from')).toBe(true);
    expect(await db.document.count()).toBe(before);
  });

  it('rejects an empty attachment list, bad base64, and an unsupported media type', async () => {
    const before = await db.document.count();
    const empty = await post({ ...payload('msg_empty', fromAlfanar, Buffer.from('x')), attachments: [] });
    expect(empty.status).toBe(400);
    const bad = await post({
      ...payload('msg_bad_b64', fromAlfanar, Buffer.from('x')),
      attachments: [
        { filename: 'invoice.pdf', contentType: 'application/pdf', contentBase64: '****' },
      ],
    });
    expect(bad.status).toBe(400);
    const json = (await bad.json()) as { issues: Array<{ path: string }> };
    expect(json.issues[0]?.path).toBe('attachments.0.contentBase64');
    const text = await post(payload('msg_text', fromAlfanar, Buffer.from('hello'), 'text/plain'));
    expect(text.status).toBe(400);
    const textJson = (await text.json()) as { issues: Array<{ path: string; message: string }> };
    expect(textJson.issues[0]?.path).toBe('attachments.0.contentType');
    expect(await db.document.count()).toBe(before);
  });

  it('rejects an attachment larger than 10 MiB and stores nothing', async () => {
    const before = await db.document.count();
    const response = await post(payload('msg_large', fromAlfanar, Buffer.alloc(10 * 1024 * 1024 + 1, 1)));
    expect(response.status).toBe(400);
    const json = (await response.json()) as { issues: Array<{ message: string }> };
    expect(json.issues[0]?.message).toMatch(/10 MiB/);
    expect(await db.document.count()).toBe(before);
  });

  it('stores an unknown sender as UNMATCHED and does not match transaction 1', async () => {
    const response = await post(payload('msg_unknown', 'unknown.sender@example.com', fixtureBytes('exact-alfanar')));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { documents: Array<{ documentId: number; result: string }> };
    expect(body.documents[0]?.result).toBe('created');
    const documentId = body.documents[0]?.documentId;
    if (documentId === undefined) throw new Error('missing document id');
    const document = await db.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { matches: true },
    });
    expect(document.status).toBe('UNMATCHED');
    expect(document.statusReason).toBe('UNKNOWN_SENDER');
    expect(document.matches).toHaveLength(0);
    expect(document.merchantName).toBe('Alfanar Fuel Station');
  });

  it('keeps the low-confidence invoice in review', async () => {
    const response = await post(payload('msg_low', fromAlfanar, fixtureBytes('low-confidence')));
    const body = (await response.json()) as { documents: Array<{ documentId: number }> };
    const documentId = body.documents[0]?.documentId;
    if (documentId === undefined) throw new Error('missing document id');
    const document = await db.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe('NEEDS_REVIEW');
    expect(document.statusReason).toBe('LOW_EXTRACTION_CONFIDENCE');
    expect(document.extractionConfidence).toBe(0.59);
  });

  it('matches the seeded Alfanar invoice to transaction 1', async () => {
    const bytes = fixtureBytes('exact-alfanar');
    const response = await post(payload('msg_8f2a1', fromAlfanar, bytes));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { documents: Array<{ documentId: number; result: string }> };
    expect(body.documents).toEqual([{ documentId: expect.any(Number), result: 'created' }]);
    const documentId = body.documents[0]?.documentId;
    if (documentId === undefined) throw new Error('missing document id');

    const document = await db.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { matches: true },
    });
    expect(document.status).toBe('MATCHED');
    expect(document.statusReason).toBe('AUTO');
    expect(document.source).toBe('EMAIL');
    expect(document.externalId).toBe('msg_8f2a1#0');
    expect(document.scope).toBe(`EMAIL:${fromAlfanar}`);
    expect(document.contentHash).toBe(sha256Hex(bytes));
    expect(document.totalAmount).toBe(12500);
    expect(document.currency).toBe('SAR');
    expect(document.cardLast4).toBe('4242');
    expect(document.invoiceNumber).toBe('INV-99812');
    expect(document.matches).toHaveLength(1);
    expect(document.matches[0]).toMatchObject({
      transactionId: 1,
      status: 'AUTO_CONFIRMED',
      decidedBy: 'system',
      confidence: 1,
    });
    expect(await db.documentMatch.count({ where: { transactionId: 1, status: 'AUTO_CONFIRMED' } })).toBe(1);
  });

  it('treats a second delivery of the same message as the same document', async () => {
    const before = await db.document.count();
    const response = await post(payload('msg_8f2a1', fromAlfanar, fixtureBytes('exact-alfanar')));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { documents: Array<{ documentId: number; result: string }> };
    expect(body.documents[0]?.result).toBe('duplicate');
    expect(await db.document.count()).toBe(before);
    expect(await db.document.count({ where: { externalId: 'msg_8f2a1#0' } })).toBe(1);
  });

  it('treats the same bytes under a new message id as a duplicate for that sender', async () => {
    const before = await db.document.count();
    const response = await post(payload('msg_redelivered_bytes', fromAlfanar, fixtureBytes('exact-alfanar')));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { documents: Array<{ result: string }> };
    expect(body.documents[0]?.result).toBe('duplicate');
    expect(await db.document.count()).toBe(before);
  });

  it('stores a second photo with the same fields as a separate document in review', async () => {
    const response = await post(payload('msg_second_photo', fromAlfanar, fixtureBytes('alfanar-second-photo')));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { documents: Array<{ documentId: number; result: string }> };
    expect(body.documents[0]?.result).toBe('created');
    const documentId = body.documents[0]?.documentId;
    if (documentId === undefined) throw new Error('missing document id');
    const document = await db.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { matches: true },
    });
    expect(document.contentHash).not.toBe(sha256Hex(fixtureBytes('exact-alfanar')));
    expect(document.status).toBe('NEEDS_REVIEW');
    expect(document.statusReason).toBe('ALREADY_CONFIRMED');
    expect(document.matches[0]?.status).toBe('CANDIDATE');
    expect(document.matches[0]?.transactionId).toBe(1);
    expect(await db.documentMatch.count({ where: { transactionId: 1, status: 'AUTO_CONFIRMED' } })).toBe(1);
  });

  it('sends the Albaik receipt to review with transactions 2 and 3', async () => {
    const response = await post(payload('msg_albaik', fromAlfanar, fixtureBytes('albaik-ambiguous'), 'image/jpeg'));
    const body = (await response.json()) as { documents: Array<{ documentId: number }> };
    const documentId = body.documents[0]?.documentId;
    if (documentId === undefined) throw new Error('missing document id');
    const document = await db.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { matches: { orderBy: { transactionId: 'asc' } } },
    });
    expect(document.status).toBe('NEEDS_REVIEW');
    expect(document.statusReason).toBe('AMBIGUOUS');
    expect(document.matches.map((match) => match.transactionId)).toEqual([2, 3]);
    expect(document.matches.every((match) => match.status === 'CANDIDATE')).toBe(true);
  });

  it('sends the tip receipt to review against transaction 4', async () => {
    const response = await post(payload('msg_tip', fromAlfanar, fixtureBytes('chefs-table-tip'), 'image/jpeg'));
    const body = (await response.json()) as { documents: Array<{ documentId: number }> };
    const documentId = body.documents[0]?.documentId;
    if (documentId === undefined) throw new Error('missing document id');
    const document = await db.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { matches: true },
    });
    expect(document.status).toBe('NEEDS_REVIEW');
    expect(document.statusReason).toBe('TIP');
    expect(document.matches[0]?.transactionId).toBe(4);
    expect(document.matches[0]?.signals).toMatchObject({ flags: ['TIP'], signals: { amount: 0.5 } });
  });

  it('leaves an invoice with no seeded charge unmatched', async () => {
    const response = await post(payload('msg_none', fromAlfanar, fixtureBytes('missing-charge')));
    const body = (await response.json()) as { documents: Array<{ documentId: number }> };
    const documentId = body.documents[0]?.documentId;
    if (documentId === undefined) throw new Error('missing document id');
    const document = await db.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { matches: true },
    });
    expect(document.status).toBe('UNMATCHED');
    expect(document.statusReason).toBe('NO_CANDIDATE');
    expect(document.matches).toHaveLength(0);
  });

  it('stores unknown bytes as UNMATCHED and a throwing fixture as FAILED', async () => {
    const unknown = await post(payload('msg_unknown_bytes', fromAlfanar, Buffer.from('not a committed fixture')));
    expect(unknown.status).toBe(200);
    const unknownBody = (await unknown.json()) as { documents: Array<{ documentId: number }> };
    const unknownId = unknownBody.documents[0]?.documentId;
    if (unknownId === undefined) throw new Error('missing document id');
    const unknownDocument = await db.document.findUniqueOrThrow({ where: { id: unknownId } });
    expect(unknownDocument.status).toBe('UNMATCHED');
    expect(unknownDocument.statusReason).toBe('UNKNOWN_DOCUMENT');

    const thrown = await post(payload('msg_throw', fromAlfanar, fixtureBytes('unreadable-scan'), 'image/jpeg'));
    expect(thrown.status).toBe(200);
    const thrownBody = (await thrown.json()) as { documents: Array<{ documentId: number }> };
    const thrownId = thrownBody.documents[0]?.documentId;
    if (thrownId === undefined) throw new Error('missing document id');
    const failed = await db.document.findUniqueOrThrow({
      where: { id: thrownId },
      include: { matches: true },
    });
    expect(failed.status).toBe('FAILED');
    expect(failed.statusReason).toBe('UNREADABLE');
    expect(failed.matches).toHaveLength(0);
  });

  it('matches the other client twin and not transaction 1', async () => {
    const response = await post(payload('msg_red_sea', fromRedSea, fixtureBytes('exact-alfanar')));
    const body = (await response.json()) as { documents: Array<{ documentId: number; result: string }> };
    expect(body.documents[0]?.result).toBe('created');
    const documentId = body.documents[0]?.documentId;
    if (documentId === undefined) throw new Error('missing document id');
    const document = await db.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { matches: true },
    });
    expect(document.scope).toBe(`EMAIL:${fromRedSea}`);
    expect(document.status).toBe('MATCHED');
    expect(document.matches.map((match) => match.transactionId)).toEqual([5]);
  });

  it('keeps one document when two identical attachments arrive together', async () => {
    const bytes = fixtureBytes('missing-merchant');
    const response = await post(payload('msg_two_same', fromAlfanar, [bytes, bytes]));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { documents: Array<{ documentId: number; result: string }> };
    expect(body.documents.map((document) => document.result)).toEqual(['created', 'duplicate']);
    expect(body.documents[0]?.documentId).toBe(body.documents[1]?.documentId);
    expect(await db.document.count({ where: { contentHash: sha256Hex(bytes) } })).toBe(1);
  });

  it('keeps one document when the same request is delivered concurrently', async () => {
    const bytes = fixtureBytes('missing-date');
    const [first, second] = await Promise.all([
      POST(emailRequest(payload('msg_concurrent', fromAlfanar, bytes))),
      POST(emailRequest(payload('msg_concurrent', fromAlfanar, bytes))),
    ]);
    await flushAfter();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await db.document.count({ where: { contentHash: sha256Hex(bytes) } })).toBe(1);
  });

  it('returns 503 when the insert fails and does not report a document', async () => {
    const before = await db.document.count();
    const failing = {
      document: {
        findFirst: async () => null,
        create: async () => {
          throw new Error('disk full');
        },
      },
    } as unknown as PrismaClient;
    const response = await handleEmailPost(
      emailRequest(payload('msg_disk', fromAlfanar, Buffer.from('disk-failure-bytes'))),
      { db: failing },
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'STORE_FAILED' });
    expect(await db.document.count()).toBe(before);
  });

  it('marks invalid extractor output FAILED and does not match', async () => {
    const extractor: DocumentExtractor = {
      async extract() {
        return { totalAmount: 12.5 } as ExtractedDocument;
      },
    };
    const response = await handleEmailPost(
      emailRequest(payload('msg_bad_extract', fromAlfanar, Buffer.from('bad-extract-bytes'))),
      { extractor },
    );
    await flushAfter();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { documents: Array<{ documentId: number }> };
    const documentId = body.documents[0]?.documentId;
    if (documentId === undefined) throw new Error('missing document id');
    const document = await db.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { matches: true },
    });
    expect(document.status).toBe('FAILED');
    expect(document.statusReason).toBe('INVALID_OUTPUT');
    expect(document.matches).toHaveLength(0);
  });

  it('lets only one worker extract a document', async () => {
    let calls = 0;
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const extractor: DocumentExtractor = {
      async extract() {
        calls += 1;
        await gate;
        return UNKNOWN_EXTRACTION;
      },
    };
    const created = await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'msg_claim#0',
        scope: 'EMAIL:claim-race@example.com',
        contentHash: 'claim-race-hash',
        senderIdentifier: 'claim-race@example.com',
        mimeType: 'application/pdf',
        content: Buffer.from('claim-race'),
      },
    });
    const first = processDocument(created.id, { db, extractor });
    const second = processDocument(created.id, { db, extractor });
    await new Promise((resolve) => setTimeout(resolve, 30));
    release();
    await Promise.all([first, second]);
    expect(calls).toBe(1);
    const document = await db.document.findUniqueOrThrow({ where: { id: created.id } });
    expect(document.status).toBe('UNMATCHED');
    expect(document.statusReason).toBe('UNKNOWN_SENDER');
  });
});
