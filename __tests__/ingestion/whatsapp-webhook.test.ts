import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { DocumentExtractor, ExtractedDocument } from '@/lib/extraction/types';
import type { MediaStore } from '@/lib/media/types';
import { disconnectPrisma, getPrisma } from '@/lib/prisma';
import { MAX_ATTACHMENT_BYTES } from '@/lib/webhooks/email-payload';
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

const databaseFile = path.resolve(process.cwd(), '.test-db/whatsapp-webhook.db');
process.env.DATABASE_URL = `file:${databaseFile}`;

const northline = '966551234567';
const redSea = '966552333444';

function requestFor(body: unknown, raw?: string): Request {
  return new Request('http://localhost/api/webhooks/whatsapp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}

function imagePayload(id: string, from: string, mediaId: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id,
                  from,
                  timestamp: '1749892860',
                  type: 'image',
                  image: { id: mediaId, mime_type: 'image/jpeg', sha256: 'a3f1c9...' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function flushAfter(): Promise<void> {
  for (let attempt = 0; attempt < 5 && mockAfterState.pending.length > 0; attempt += 1) {
    const batch = mockAfterState.pending.splice(0, mockAfterState.pending.length);
    await Promise.all(batch);
  }
}

describe('whatsapp webhook', () => {
  let db: PrismaClient;
  let POST: (request: Request) => Promise<Response>;
  let handleWhatsAppPost: typeof import('@/app/api/webhooks/whatsapp/route').handleWhatsAppPost;

  beforeAll(async () => {
    fs.rmSync(databaseFile, { force: true });
    fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
    execFileSync(path.join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${databaseFile}` },
      stdio: 'pipe',
    });
    const route = await import('@/app/api/webhooks/whatsapp/route');
    POST = route.POST;
    handleWhatsAppPost = route.handleWhatsAppPost;
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
    const response = await POST(requestFor(body, raw));
    await flushAfter();
    return response;
  }

  async function stored(response: Response) {
    const body = (await response.json()) as { documents: Array<{ documentId: number; result: string }> };
    const documentId = body.documents[0]?.documentId;
    if (documentId === undefined) throw new Error('missing document id');
    const document = await db.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { matches: true },
    });
    return { body, document };
  }

  it('rejects malformed JSON and stores nothing', async () => {
    const before = await db.document.count();
    const response = await post({}, '{');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'INVALID_JSON' });
    expect(await db.document.count()).toBe(before);
  });

  it('rejects a payload that is missing the envelope', async () => {
    const before = await db.document.count();
    const response = await post({ object: 'whatsapp_business_account' });
    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: string; issues: Array<{ path: string }> };
    expect(json.error).toBe('INVALID_PAYLOAD');
    expect(json.issues.some((issue) => issue.path === 'entry')).toBe(true);
    expect(await db.document.count()).toBe(before);
  });

  it('rejects an image message that has no image object', async () => {
    const before = await db.document.count();
    const response = await post({
      entry: [{ changes: [{ value: { messages: [{ id: 'wamid.noimage', from: northline, timestamp: '1', type: 'image' }] } }] }],
    });
    expect(response.status).toBe(400);
    expect(await db.document.count()).toBe(before);
  });

  it('acknowledges a non-image message without storing it', async () => {
    const before = await db.document.count();
    const response = await post({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ id: 'wamid.text', from: northline, timestamp: '1749892860', type: 'text' }],
              },
            },
          ],
        },
      ],
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ documents: [] });
    expect(await db.document.count()).toBe(before);
  });

  it('acknowledges an unknown media id, an invalid phone, and a non-image type without storing them', async () => {
    const before = await db.document.count();
    const unknown = await post(imagePayload('wamid.missing.media', northline, '../../package.json'));
    const absent = await post(imagePayload('wamid.unknown.media', northline, 'media_does_not_exist'));
    const phone = await post(imagePayload('wamid.bad.phone', 'not-a-phone', 'media_4471'));
    const pdf = await post(imagePayload('wamid.pdf', northline, 'media_missing_charge'));
    for (const response of [unknown, absent, phone, pdf]) {
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ documents: [] });
    }
    expect(await db.document.count()).toBe(before);
  });

  it('stores a low-confidence photo for review before the charge is confirmed', async () => {
    const response = await post(imagePayload('wamid.low', northline, 'media_low'));
    expect(response.status).toBe(200);
    const { document } = await stored(response);
    expect(document.status).toBe('NEEDS_REVIEW');
    expect(document.statusReason).toBe('LOW_EXTRACTION_CONFIDENCE');
    expect(document.scope).toBe('WHATSAPP:+966551234567');
  });

  it('matches the seeded Alfanar photo to transaction 1', async () => {
    const response = await post(imagePayload('wamid.exact.alfanar', northline, 'media_4471'));
    expect(response.status).toBe(200);
    const { body, document } = await stored(response);
    expect(body.documents).toEqual([{ documentId: document.id, result: 'created' }]);
    expect(document.source).toBe('WHATSAPP');
    expect(document.externalId).toBe('wamid.exact.alfanar');
    expect(document.scope).toBe('WHATSAPP:+966551234567');
    expect(document.senderIdentifier).toBe('+966551234567');
    expect(document.filename).toBe('media_4471');
    expect(document.mimeType).toBe('image/jpeg');
    expect(document.status).toBe('MATCHED');
    expect(document.statusReason).toBe('AUTO');
    expect(document.totalAmount).toBe(12500);
    expect(document.merchantName).toBe('Alfanar Fuel Station');
    expect(document.matches).toEqual([
      expect.objectContaining({
        transactionId: 1,
        status: 'AUTO_CONFIRMED',
        confidence: 1,
        decidedBy: 'system',
      }),
    ]);
  });

  it('treats a redelivery and a Saudi local number as the same document', async () => {
    const again = await post(imagePayload('wamid.exact.alfanar', northline, 'media_4471'));
    const local = await post(imagePayload('wamid.local.form', '0551234567', 'media_4471'));
    const againBody = (await again.json()) as { documents: Array<{ documentId: number; result: string }> };
    const localBody = (await local.json()) as { documents: Array<{ documentId: number; result: string }> };
    expect(againBody.documents[0]?.result).toBe('duplicate');
    expect(localBody.documents[0]?.result).toBe('duplicate');
    expect(localBody.documents[0]?.documentId).toBe(againBody.documents[0]?.documentId);
    expect(await db.document.count({ where: { scope: 'WHATSAPP:+966551234567', filename: 'media_4471' } })).toBe(1);
  });

  it('keeps one document when the same photo arrives under a new message id', async () => {
    const response = await post(imagePayload('wamid.same.photo', northline, 'media_4471'));
    const body = (await response.json()) as { documents: Array<{ result: string }> };
    expect(body.documents[0]?.result).toBe('duplicate');
    expect(await db.document.count({ where: { externalId: 'wamid.same.photo' } })).toBe(0);
  });

  it('matches the same bytes for the other driver and not transaction 1', async () => {
    const response = await post(imagePayload('wamid.red.sea', redSea, 'media_4471'));
    const { document } = await stored(response);
    expect(document.scope).toBe('WHATSAPP:+966552333444');
    expect(document.status).toBe('MATCHED');
    expect(document.matches.map((match) => match.transactionId)).toEqual([5]);
  });

  it('stores an unknown driver as unmatched and does not call another driver', async () => {
    const response = await post(imagePayload('wamid.unknown.driver', '966500000000', 'media_second'));
    const { document } = await stored(response);
    expect(document.status).toBe('UNMATCHED');
    expect(document.statusReason).toBe('UNKNOWN_SENDER');
    expect(document.totalAmount).toBe(12500);
    expect(document.matches).toHaveLength(0);
  });

  it('stores the ambiguous, tip, unreadable, and unmatched fixtures', async () => {
    const albaik = await stored(await post(imagePayload('wamid.albaik', northline, 'media_albaik')));
    expect(albaik.document.status).toBe('NEEDS_REVIEW');
    expect(albaik.document.statusReason).toBe('AMBIGUOUS');
    expect(albaik.document.matches.map((match) => match.transactionId).sort()).toEqual([2, 3]);

    const tip = await stored(await post(imagePayload('wamid.tip', northline, 'media_tip')));
    expect(tip.document.status).toBe('NEEDS_REVIEW');
    expect(tip.document.statusReason).toBe('TIP');
    expect(tip.document.matches.map((match) => match.transactionId)).toEqual([4]);

    const scan = await stored(await post(imagePayload('wamid.scan', northline, 'media_scan')));
    expect(scan.document.status).toBe('FAILED');
    expect(scan.document.statusReason).toBe('UNREADABLE');
    expect(scan.document.matches).toHaveLength(0);

    const unknown = await stored(await post(imagePayload('wamid.unknown.bytes', northline, 'media_unknown')));
    expect(unknown.document.status).toBe('UNMATCHED');
    expect(unknown.document.statusReason).toBe('UNKNOWN_DOCUMENT');

    const missing = await stored(await post(imagePayload('wamid.no.charge', northline, 'media_no_charge')));
    expect(missing.document.status).toBe('UNMATCHED');
    expect(missing.document.matches).toHaveLength(0);
  });

  it('sends a second photo of a confirmed charge to review', async () => {
    const { document } = await stored(await post(imagePayload('wamid.second', northline, 'media_second')));
    expect(document.status).toBe('NEEDS_REVIEW');
    expect(document.statusReason).toBe('ALREADY_CONFIRMED');
    expect(document.matches.every((match) => match.status === 'CANDIDATE')).toBe(true);
    expect(await db.documentMatch.count({ where: { transactionId: 1, status: 'AUTO_CONFIRMED' } })).toBe(1);
  });

  it('keeps one document when the same message is delivered concurrently', async () => {
    const body = imagePayload('wamid.concurrent', northline, 'media_missing_date');
    const [first, second] = await Promise.all([POST(requestFor(body)), POST(requestFor(body))]);
    await flushAfter();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await db.document.count({ where: { externalId: 'wamid.concurrent' } })).toBe(1);
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
    const response = await handleWhatsAppPost(requestFor(imagePayload('wamid.disk', northline, 'media_unreadable')), {
      db: failing,
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'STORE_FAILED' });
    expect(await db.document.count()).toBe(before);
  });

  it('returns 503 when media lookup fails for a reason other than an unknown id', async () => {
    const before = await db.document.count();
    const mediaStore: MediaStore = {
      async get() {
        throw new Error('fixture disk');
      },
    };
    const response = await handleWhatsAppPost(requestFor(imagePayload('wamid.media.down', northline, 'media_4471')), {
      mediaStore,
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'STORE_FAILED' });
    expect(await db.document.count()).toBe(before);
  });

  it('skips an oversized fixture without storing it', async () => {
    const before = await db.document.count();
    const mediaStore: MediaStore = {
      async get() {
        return { bytes: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1), mimeType: 'image/jpeg' };
      },
    };
    const response = await handleWhatsAppPost(requestFor(imagePayload('wamid.huge', northline, 'media_4471')), {
      mediaStore,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ documents: [] });
    expect(await db.document.count()).toBe(before);
  });

  it('marks invalid extractor output FAILED', async () => {
    const extractor: DocumentExtractor = {
      async extract() {
        return { totalAmount: 12.5 } as ExtractedDocument;
      },
    };
    const response = await handleWhatsAppPost(requestFor(imagePayload('wamid.bad.extract', northline, 'media_unreadable')), {
      extractor,
    });
    await flushAfter();
    const { document } = await stored(response);
    expect(document.status).toBe('FAILED');
    expect(document.statusReason).toBe('INVALID_OUTPUT');
    expect(document.matches).toHaveLength(0);
  });

});
