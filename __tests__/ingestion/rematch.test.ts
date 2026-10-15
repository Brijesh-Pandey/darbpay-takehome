import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { MatchResult } from '@/lib/matching/types';
import { applyRematch } from '@/lib/services/match-persistence';
import { confirmMatchDecision } from '@/lib/services/review-decisions';
import { rematchForCharges } from '@/lib/services/rematch';
import { seedReferenceData } from '../../prisma/seed';

const databaseFile = path.resolve(process.cwd(), '.test-db/rematch.db');
const databaseUrl = `file:${databaseFile}`;

let db: PrismaClient;
let POST: (request: Request) => Promise<Response>;
let sequence = 0;

function migrate(): void {
  execFileSync(path.join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}

function requestFor(body: unknown, raw?: string): Request {
  return new Request('http://localhost/api/transactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}

function charge(externalRef: string, amount: number, merchantName: string, extra: Record<string, unknown> = {}) {
  return {
    externalRef,
    clientId: 1,
    cardLast4: '4242',
    driverPhone: '966551234567',
    merchantName,
    amount,
    currency: 'SAR',
    transactionAt: '2025-07-01T09:00:00.000Z',
    ...extra,
  };
}

async function unmatched(input: {
  merchantName: string;
  totalAmount: number | null;
  documentType?: string | null;
  sender?: string;
  source?: 'EMAIL' | 'WHATSAPP';
  cardLast4?: string;
  confidence?: number | null;
}) {
  sequence += 1;
  const source = input.source ?? 'EMAIL';
  const sender = input.sender ?? 'billing@alfanar-fuel.com.sa';
  return db.document.create({
    data: {
      source,
      externalId: `late-${sequence}`,
      scope: source === 'EMAIL' ? `EMAIL:${sender}` : `WHATSAPP:${sender}`,
      contentHash: `late-hash-${sequence}`,
      senderIdentifier: sender,
      status: 'UNMATCHED',
      statusReason: 'NO_CANDIDATE',
      mimeType: 'application/pdf',
      content: new Uint8Array(Buffer.from(`late-${sequence}`)),
      documentType: input.documentType === undefined ? 'RECEIPT' : input.documentType,
      merchantName: input.merchantName,
      totalAmount: input.totalAmount,
      currency: 'SAR',
      documentDate: new Date('2025-07-01T09:00:00.000Z'),
      cardLast4: input.cardLast4 ?? '4242',
      extractionConfidence: input.confidence === undefined ? 0.96 : input.confidence,
    },
  });
}

describe('late transactions', () => {
  beforeAll(async () => {
    fs.rmSync(databaseFile, { force: true });
    fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
    migrate();
    process.env.DATABASE_URL = databaseUrl;
    const route = await import('@/app/api/transactions/route');
    POST = route.POST;
    db = new PrismaClient({ datasourceUrl: databaseUrl });
    await db.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
    await seedReferenceData(db);
  }, 60_000);

  afterAll(async () => {
    await db.$disconnect();
    delete process.env.DATABASE_URL;
    fs.rmSync(databaseFile, { force: true });
    fs.rmSync(`${databaseFile}-journal`, { force: true });
  });

  it('rejects a bad body and an unknown client without storing a charge', async () => {
    const before = await db.transaction.count();
    const malformed = await POST(requestFor({}, '{'));
    expect(malformed.status).toBe(400);
    const unknown = await POST(requestFor({ transactions: [charge('missing-client', 22222, 'LATE FUEL STATION', { clientId: 99 })] }));
    expect(unknown.status).toBe(400);
    expect(await db.transaction.count()).toBe(before);
  });

  it('matches an early receipt when the charge arrives', async () => {
    const document = await unmatched({ merchantName: 'LATE FUEL STATION', totalAmount: 22222 });
    const response = await POST(requestFor({ transactions: [charge('late-exact', 22222, 'LATE FUEL STATION')] }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { transactions: Array<{ transactionId: number; result: string }> };
    expect(body.transactions[0]?.result).toBe('created');
    const transactionId = body.transactions[0]?.transactionId;
    if (transactionId === undefined) throw new Error('missing transaction id');

    const stored = await db.document.findUniqueOrThrow({
      where: { id: document.id },
      include: { matches: true },
    });
    expect(stored.status).toBe('MATCHED');
    expect(stored.statusReason).toBe('AUTO');
    expect(stored.matches).toEqual([
      expect.objectContaining({
        transactionId,
        status: 'AUTO_CONFIRMED',
        decidedBy: 'system',
      }),
    ]);

    const again = await POST(requestFor({ transactions: [charge('late-exact', 22222, 'LATE FUEL STATION')] }));
    const duplicate = (await again.json()) as { transactions: Array<{ transactionId: number; result: string }> };
    expect(duplicate.transactions).toEqual([{ transactionId, result: 'duplicate' }]);
    expect(await db.transaction.count({ where: { externalRef: 'late-exact' } })).toBe(1);
    expect(await db.documentMatch.count({ where: { transactionId, status: 'AUTO_CONFIRMED' } })).toBe(1);
  });

  it('leaves an unusable extraction unmatched', async () => {
    const document = await unmatched({
      merchantName: 'LATE GARBAGE',
      totalAmount: null,
      documentType: 'UNKNOWN',
      confidence: 0,
    });
    const response = await POST(requestFor({ transactions: [charge('late-garbage', 10101, 'LATE GARBAGE')] }));
    expect(response.status).toBe(200);
    const stored = await db.document.findUniqueOrThrow({ where: { id: document.id }, include: { matches: true } });
    expect(stored.status).toBe('UNMATCHED');
    expect(stored.matches).toHaveLength(0);
  });

  it('sends an ambiguous late pair to review', async () => {
    const document = await unmatched({ merchantName: 'LATE CAFE', totalAmount: 33333 });
    const response = await POST(
      requestFor({
        transactions: [
          charge('late-cafe-a', 33333, 'LATE CAFE'),
          charge('late-cafe-b', 33333, 'LATE CAFE', { transactionAt: '2025-07-01T11:00:00.000Z' }),
        ],
      }),
    );
    expect(response.status).toBe(200);
    const stored = await db.document.findUniqueOrThrow({ where: { id: document.id }, include: { matches: true } });
    expect(stored.status).toBe('NEEDS_REVIEW');
    expect(stored.statusReason).toBe('AMBIGUOUS');
    expect(stored.matches.map((match) => match.status).sort()).toEqual(['CANDIDATE', 'CANDIDATE']);
  });

  it('does not match a different amount, another client, or another driver', async () => {
    const amount = await unmatched({ merchantName: 'LATE OTHER', totalAmount: 44444 });
    await POST(requestFor({ transactions: [charge('late-other', 100, 'LATE OTHER')] }));
    expect((await db.document.findUniqueOrThrow({ where: { id: amount.id } })).status).toBe('UNMATCHED');

    const client = await unmatched({ merchantName: 'LATE CLIENT', totalAmount: 55555 });
    await POST(requestFor({ transactions: [charge('late-client', 55555, 'LATE CLIENT', { clientId: 2 })] }));
    expect((await db.document.findUniqueOrThrow({ where: { id: client.id } })).status).toBe('UNMATCHED');

    const driver = await unmatched({
      merchantName: 'LATE DRIVER',
      totalAmount: 66666,
      source: 'WHATSAPP',
      sender: '+966550111222',
    });
    await POST(requestFor({ transactions: [charge('late-driver', 66666, 'LATE DRIVER')] }));
    expect((await db.document.findUniqueOrThrow({ where: { id: driver.id } })).status).toBe('UNMATCHED');
  });

  it('does not auto-confirm a charge that another document already confirmed', async () => {
    const created = await POST(requestFor({ transactions: [charge('late-taken', 77777, 'LATE TAKEN')] }));
    const body = (await created.json()) as { transactions: Array<{ transactionId: number }> };
    const transactionId = body.transactions[0]?.transactionId;
    if (transactionId === undefined) throw new Error('missing transaction id');
    const holder = await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'late-holder',
        scope: 'EMAIL:billing@alfanar-fuel.com.sa',
        contentHash: 'late-holder-hash',
        senderIdentifier: 'billing@alfanar-fuel.com.sa',
        status: 'MATCHED',
        statusReason: 'REVIEWER_CONFIRMED',
        mimeType: 'application/pdf',
        content: new Uint8Array(Buffer.from('holder')),
      },
    });
    await db.documentMatch.create({
      data: {
        documentId: holder.id,
        transactionId,
        confidence: 1,
        signals: { signals: { amount: 1 }, flags: [] },
        status: 'CONFIRMED',
        decidedBy: 'reviewer',
        decidedAt: new Date('2025-07-01T10:00:00.000Z'),
      },
    });
    const late = await unmatched({ merchantName: 'LATE TAKEN', totalAmount: 77777 });
    await POST(requestFor({ transactions: [charge('late-taken', 77777, 'LATE TAKEN')] }));
    const stored = await db.document.findUniqueOrThrow({ where: { id: late.id }, include: { matches: true } });
    expect(stored.status).toBe('NEEDS_REVIEW');
    expect(stored.statusReason).toBe('ALREADY_CONFIRMED');
    expect(stored.matches.every((match) => match.status === 'CANDIDATE')).toBe(true);
    expect(await db.documentMatch.count({ where: { transactionId, status: { in: ['CONFIRMED', 'AUTO_CONFIRMED'] } } })).toBe(1);
    const kept = await db.documentMatch.findFirstOrThrow({ where: { documentId: holder.id } });
    expect(kept.status).toBe('CONFIRMED');
    expect(kept.decidedBy).toBe('reviewer');
  });

  it('does not offer a transaction a reviewer already rejected', async () => {
    const created = await POST(requestFor({ transactions: [charge('late-reject', 88888, 'LATE REJECT')] }));
    const body = (await created.json()) as { transactions: Array<{ transactionId: number }> };
    const transactionId = body.transactions[0]?.transactionId;
    if (transactionId === undefined) throw new Error('missing transaction id');
    const document = await unmatched({ merchantName: 'LATE REJECT', totalAmount: 88888 });
    await db.documentMatch.create({
      data: {
        documentId: document.id,
        transactionId,
        confidence: 1,
        signals: { signals: { amount: 1 }, flags: [] },
        status: 'REJECTED',
        decidedBy: 'reviewer',
        decidedAt: new Date('2025-07-01T10:00:00.000Z'),
      },
    });
    await POST(requestFor({ transactions: [charge('late-reject', 88888, 'LATE REJECT')] }));
    const stored = await db.document.findUniqueOrThrow({ where: { id: document.id }, include: { matches: true } });
    expect(stored.status).toBe('UNMATCHED');
    expect(stored.matches).toEqual([expect.objectContaining({ transactionId, status: 'REJECTED', decidedBy: 'reviewer' })]);
  });

  it('lets two early receipts compete for one late charge', async () => {
    const left = await unmatched({ merchantName: 'LATE RACE', totalAmount: 12121 });
    const right = await unmatched({ merchantName: 'LATE RACE', totalAmount: 12121 });
    const response = await POST(requestFor({ transactions: [charge('late-race', 12121, 'LATE RACE')] }));
    const body = (await response.json()) as { transactions: Array<{ transactionId: number }> };
    const transactionId = body.transactions[0]?.transactionId;
    if (transactionId === undefined) throw new Error('missing transaction id');
    expect(await db.documentMatch.count({ where: { transactionId, status: { in: ['CONFIRMED', 'AUTO_CONFIRMED'] } } })).toBe(1);
    const documents = await db.document.findMany({
      where: { id: { in: [left.id, right.id] } },
      include: { matches: true },
    });
    const statuses = documents.map((document) => document.status).sort();
    expect(statuses).toEqual(['MATCHED', 'NEEDS_REVIEW']);
  });

  it('does not let a rematch replace a manual confirmation', async () => {
    const created = await POST(requestFor({ transactions: [charge('late-manual', 13131, 'LATE MANUAL')] }));
    const body = (await created.json()) as { transactions: Array<{ transactionId: number }> };
    const transactionId = body.transactions[0]?.transactionId;
    if (transactionId === undefined) throw new Error('missing transaction id');
    const review = await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'late-manual-review',
        scope: 'EMAIL:billing@alfanar-fuel.com.sa',
        contentHash: 'late-manual-review-hash',
        senderIdentifier: 'billing@alfanar-fuel.com.sa',
        status: 'NEEDS_REVIEW',
        mimeType: 'application/pdf',
        content: new Uint8Array(Buffer.from('manual')),
      },
    });
    const matchId = (
      await db.documentMatch.create({
        data: {
          documentId: review.id,
          transactionId,
          confidence: 0.9,
          signals: { signals: { amount: 1 }, flags: [] },
          status: 'CANDIDATE',
        },
      })
    ).id;
    const late = await unmatched({ merchantName: 'LATE MANUAL', totalAmount: 13131 });
    const storedCharge = await db.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    const [decision] = await Promise.all([
      confirmMatchDecision(db, matchId),
      rematchForCharges(
        db,
        [{ transactionId, result: 'created', clientId: storedCharge.clientId, driverPhone: storedCharge.driverPhone }],
        () => new Date(),
      ),
    ]);
    expect(['CONFIRMED', 'CONFLICT']).toContain(decision.status);
    expect(await db.documentMatch.count({ where: { transactionId, status: { in: ['CONFIRMED', 'AUTO_CONFIRMED'] } } })).toBe(1);
    const lateDocument = await db.document.findUniqueOrThrow({ where: { id: late.id }, include: { matches: true } });
    const reviewMatch = await db.documentMatch.findUniqueOrThrow({ where: { id: matchId } });
    const winners = [reviewMatch.status, ...lateDocument.matches.map((match) => match.status)].filter(
      (status) => status === 'CONFIRMED' || status === 'AUTO_CONFIRMED',
    );
    expect(winners).toHaveLength(1);
  });

  it('does not apply a rematch result to a document that is no longer unmatched', async () => {
    const document = await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'late-final',
        scope: 'EMAIL:billing@alfanar-fuel.com.sa',
        contentHash: 'late-final-hash',
        senderIdentifier: 'billing@alfanar-fuel.com.sa',
        status: 'MATCHED',
        statusReason: 'REVIEWER_CONFIRMED',
        mimeType: 'application/pdf',
        content: new Uint8Array(Buffer.from('final')),
      },
    });
    const result: MatchResult = {
      outcome: 'AUTO_MATCHED',
      reason: 'AUTO',
      candidates: [{ transactionId: 1, confidence: 1, signals: { amount: 1 }, flags: [] }],
    };
    await expect(applyRematch(db, document.id, result, new Date())).resolves.toBe('skipped');
    const stored = await db.document.findUniqueOrThrow({ where: { id: document.id }, include: { matches: true } });
    expect(stored.statusReason).toBe('REVIEWER_CONFIRMED');
    expect(stored.matches).toHaveLength(0);
  });

  it('returns 503 when the insert fails and stores nothing', async () => {
    const before = await db.transaction.count();
    const failing = {
      client: { findMany: async () => [{ id: 1 }] },
      transaction: {
        findUnique: async () => null,
        create: async () => {
          throw new Error('disk full');
        },
      },
    } as unknown as PrismaClient;
    const { handleTransactionsPost } = await import('@/app/api/transactions/route');
    const response = await handleTransactionsPost(requestFor({ transactions: [charge('late-disk', 14141, 'LATE DISK')] }), {
      db: failing,
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'STORE_FAILED' });
    expect(await db.transaction.count()).toBe(before);
  });
});
