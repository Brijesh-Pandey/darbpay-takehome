import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient, type DocumentStatus, type MatchStatus } from '@prisma/client';
import type { ExtractedDocument } from '@/lib/extraction/types';
import type { MatchResult } from '@/lib/matching/types';
import { matchIdSchema } from '@/lib/actions/review-schema';
import { persistOutcome } from '@/lib/services/match-persistence';
import {
  confirmMatchDecision,
  rejectMatchDecision,
  REVIEWER_ID,
} from '@/lib/services/review-decisions';
import { seedReferenceData } from '../../prisma/seed';

const databaseFile = path.resolve(process.cwd(), '.test-db/review.db');
const databaseUrl = `file:${databaseFile}`;

let db: PrismaClient;
let sequence = 0;

const extraction: ExtractedDocument = {
  documentType: 'RECEIPT',
  merchantName: 'Albaik',
  vatNumber: null,
  totalAmount: 4800,
  currency: 'SAR',
  documentDate: '2025-06-12',
  cardLast4: '4242',
  invoiceNumber: null,
  rawText: 'review-fixture',
  extractionConfidence: 0.91,
};

function migrate(): void {
  execFileSync(path.join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}

async function makeDocument(
  status: DocumentStatus,
  sender = 'billing@alfanar-fuel.com.sa',
  source: 'EMAIL' | 'WHATSAPP' = 'EMAIL',
): Promise<number> {
  sequence += 1;
  const scope = source === 'EMAIL' ? `EMAIL:${sender}` : `WHATSAPP:${sender}`;
  const created = await db.document.create({
    data: {
      source,
      externalId: `review-${sequence}`,
      scope,
      contentHash: `review-hash-${sequence}`,
      senderIdentifier: sender,
      status,
      mimeType: 'application/pdf',
      content: new Uint8Array(Buffer.from(`review-${sequence}`)),
    },
  });
  return created.id;
}

async function makeMatch(documentId: number, transactionId: number, status: MatchStatus = 'CANDIDATE'): Promise<number> {
  const created = await db.documentMatch.create({
    data: {
      documentId,
      transactionId,
      confidence: 0.91,
      signals: { signals: { amount: 1, merchant: 1 }, flags: [] },
      status,
      decidedBy: status === 'AUTO_CONFIRMED' ? 'system' : null,
      decidedAt: status === 'AUTO_CONFIRMED' ? new Date('2025-06-14T09:21:00Z') : null,
    },
  });
  return created.id;
}

describe('match id schema', () => {
  it('accepts a positive integer and rejects anything else', () => {
    expect(matchIdSchema.safeParse({ matchId: 4 }).success).toBe(true);
    expect(matchIdSchema.safeParse({ matchId: 0 }).success).toBe(false);
    expect(matchIdSchema.safeParse({ matchId: 1.5 }).success).toBe(false);
    expect(matchIdSchema.safeParse({ matchId: -3 }).success).toBe(false);
    expect(matchIdSchema.safeParse({}).success).toBe(false);
    expect(matchIdSchema.safeParse({ matchId: 4, decidedBy: 'admin' }).success).toBe(false);
  });
});

describe('review decisions', () => {
  beforeAll(async () => {
    fs.rmSync(databaseFile, { force: true });
    fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
    migrate();
    db = new PrismaClient({ datasourceUrl: databaseUrl });
    await db.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
    await seedReferenceData(db);
  }, 60_000);

  afterAll(async () => {
    await db.$disconnect();
    fs.rmSync(databaseFile, { force: true });
    fs.rmSync(`${databaseFile}-journal`, { force: true });
  });

  it('confirms one candidate, rejects its sibling, and matches the document', async () => {
    const documentId = await makeDocument('NEEDS_REVIEW');
    const chosen = await makeMatch(documentId, 2);
    await makeMatch(documentId, 3);

    const result = await confirmMatchDecision(db, chosen);

    expect(result).toMatchObject({ status: 'CONFIRMED', matchId: chosen, documentId, documentStatus: 'MATCHED' });
    const matches = await db.documentMatch.findMany({ where: { documentId }, orderBy: { transactionId: 'asc' } });
    expect(matches.map((match) => ({ transactionId: match.transactionId, status: match.status, decidedBy: match.decidedBy }))).toEqual([
      { transactionId: 2, status: 'CONFIRMED', decidedBy: REVIEWER_ID },
      { transactionId: 3, status: 'REJECTED', decidedBy: REVIEWER_ID },
    ]);
    expect(matches[0]?.decidedAt).toBeInstanceOf(Date);
    const document = await db.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe('MATCHED');
    expect(document.statusReason).toBe('REVIEWER_CONFIRMED');
  });

  it('returns NOT_FOUND for a missing match and writes nothing', async () => {
    const before = await db.documentMatch.count();
    await expect(confirmMatchDecision(db, 999999)).resolves.toEqual({ status: 'NOT_FOUND', matchId: 999999 });
    await expect(rejectMatchDecision(db, 999998)).resolves.toEqual({ status: 'NOT_FOUND', matchId: 999998 });
    expect(await db.documentMatch.count()).toBe(before);
  });

  it('rolls back a confirmation when the document is not waiting for review', async () => {
    const documentId = await makeDocument('FAILED');
    const matchId = await makeMatch(documentId, 6);
    const result = await confirmMatchDecision(db, matchId);
    expect(result.status).toBe('CONFLICT');
    const match = await db.documentMatch.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe('CANDIDATE');
    expect(match.decidedBy).toBeNull();
    const document = await db.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe('FAILED');
  });

  it('refuses a second document when the transaction is already confirmed', async () => {
    const firstDocument = await makeDocument('NEEDS_REVIEW');
    const firstMatch = await makeMatch(firstDocument, 4);
    expect((await confirmMatchDecision(db, firstMatch)).status).toBe('CONFIRMED');

    const secondDocument = await makeDocument('NEEDS_REVIEW');
    const secondMatch = await makeMatch(secondDocument, 4);
    const result = await confirmMatchDecision(db, secondMatch);
    expect(result.status).toBe('CONFLICT');
    const match = await db.documentMatch.findUniqueOrThrow({ where: { id: secondMatch } });
    expect(match.status).toBe('CANDIDATE');
    expect(await db.documentMatch.count({ where: { transactionId: 4, status: { in: ['CONFIRMED', 'AUTO_CONFIRMED'] } } })).toBe(1);
  });

  it('refuses another candidate on a document that is already confirmed', async () => {
    const documentId = await makeDocument('MATCHED');
    await makeMatch(documentId, 7, 'AUTO_CONFIRMED');
    const extra = await makeMatch(documentId, 8);
    const result = await confirmMatchDecision(db, extra);
    expect(result.status).toBe('CONFLICT');
    const match = await db.documentMatch.findUniqueOrThrow({ where: { id: extra } });
    expect(match.status).toBe('CANDIDATE');
    expect(await db.documentMatch.count({ where: { documentId, status: { in: ['CONFIRMED', 'AUTO_CONFIRMED'] } } })).toBe(1);
  });

  it('does not revive a rejected candidate', async () => {
    const documentId = await makeDocument('NEEDS_REVIEW');
    const matchId = await makeMatch(documentId, 9);
    expect((await rejectMatchDecision(db, matchId)).status).toBe('REJECTED');
    const again = await confirmMatchDecision(db, matchId);
    expect(again.status).toBe('ALREADY_REJECTED');
    const match = await db.documentMatch.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe('REJECTED');
    expect(await db.documentMatch.count({ where: { documentId, status: { in: ['CONFIRMED', 'AUTO_CONFIRMED'] } } })).toBe(0);
  });

  it('treats a second confirm of the same match as already confirmed', async () => {
    const documentId = await makeDocument('NEEDS_REVIEW');
    const matchId = await makeMatch(documentId, 8);
    expect((await confirmMatchDecision(db, matchId)).status).toBe('CONFIRMED');
    const again = await confirmMatchDecision(db, matchId);
    expect(again.status).toBe('ALREADY_CONFIRMED');
    expect(await db.documentMatch.count({ where: { documentId, status: 'CONFIRMED' } })).toBe(1);
  });

  it('refuses a candidate whose transaction is outside the sender scope', async () => {
    const emailDocument = await makeDocument('NEEDS_REVIEW', 'billing@alfanar-fuel.com.sa', 'EMAIL');
    const emailMatch = await makeMatch(emailDocument, 5);
    expect((await confirmMatchDecision(db, emailMatch)).status).toBe('CONFLICT');
    expect((await db.documentMatch.findUniqueOrThrow({ where: { id: emailMatch } })).status).toBe('CANDIDATE');

    const whatsappDocument = await makeDocument('NEEDS_REVIEW', '+966551234567', 'WHATSAPP');
    const whatsappMatch = await makeMatch(whatsappDocument, 5);
    expect((await confirmMatchDecision(db, whatsappMatch)).status).toBe('CONFLICT');
    expect((await db.documentMatch.findUniqueOrThrow({ where: { id: whatsappMatch } })).status).toBe('CANDIDATE');
    expect(await db.documentMatch.count({ where: { transactionId: 5, status: { in: ['CONFIRMED', 'AUTO_CONFIRMED'] } } })).toBe(0);
  });

  it('rejects one candidate and leaves the document in review', async () => {
    const documentId = await makeDocument('NEEDS_REVIEW');
    const rejected = await makeMatch(documentId, 11);
    const kept = await makeMatch(documentId, 12);
    const result = await rejectMatchDecision(db, rejected);
    expect(result).toMatchObject({ status: 'REJECTED', documentStatus: 'NEEDS_REVIEW' });
    expect((await db.documentMatch.findUniqueOrThrow({ where: { id: rejected } })).status).toBe('REJECTED');
    expect((await db.documentMatch.findUniqueOrThrow({ where: { id: kept } })).status).toBe('CANDIDATE');
    expect(await db.documentMatch.count({ where: { documentId, status: { in: ['CONFIRMED', 'AUTO_CONFIRMED'] } } })).toBe(0);
    expect((await db.document.findUniqueOrThrow({ where: { id: documentId } })).status).toBe('NEEDS_REVIEW');
  });

  it('moves the document to unmatched when the last candidate is rejected', async () => {
    const documentId = await makeDocument('NEEDS_REVIEW');
    const first = await makeMatch(documentId, 13);
    const second = await makeMatch(documentId, 14);
    expect((await rejectMatchDecision(db, first)).documentStatus).toBe('NEEDS_REVIEW');
    const last = await rejectMatchDecision(db, second);
    expect(last).toMatchObject({ status: 'REJECTED', documentStatus: 'UNMATCHED' });
    const document = await db.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe('UNMATCHED');
    expect(document.statusReason).toBe('ALL_CANDIDATES_REJECTED');
    expect(await db.documentMatch.count({ where: { documentId, status: 'CANDIDATE' } })).toBe(0);
    expect(await db.documentMatch.count({ where: { documentId, status: { in: ['CONFIRMED', 'AUTO_CONFIRMED'] } } })).toBe(0);
  });

  it('treats a second rejection as already rejected', async () => {
    const documentId = await makeDocument('NEEDS_REVIEW');
    const matchId = await makeMatch(documentId, 15);
    expect((await rejectMatchDecision(db, matchId)).status).toBe('REJECTED');
    const again = await rejectMatchDecision(db, matchId);
    expect(again.status).toBe('ALREADY_REJECTED');
    expect(await db.documentMatch.count({ where: { id: matchId, status: 'REJECTED' } })).toBe(1);
  });

  it('does not undo a confirmation when that match is rejected', async () => {
    const documentId = await makeDocument('NEEDS_REVIEW');
    const matchId = await makeMatch(documentId, 1);
    expect((await confirmMatchDecision(db, matchId)).status).toBe('CONFIRMED');
    const result = await rejectMatchDecision(db, matchId);
    expect(result.status).toBe('CONFLICT');
    const match = await db.documentMatch.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe('CONFIRMED');
    expect(match.decidedBy).toBe(REVIEWER_ID);
    expect((await db.document.findUniqueOrThrow({ where: { id: documentId } })).status).toBe('MATCHED');
  });

  it('lets only one of two documents confirm the same transaction', async () => {
    const leftDocument = await makeDocument('NEEDS_REVIEW');
    const rightDocument = await makeDocument('NEEDS_REVIEW');
    const left = await makeMatch(leftDocument, 6);
    const right = await makeMatch(rightDocument, 6);
    const [leftResult, rightResult] = await Promise.all([
      confirmMatchDecision(db, left),
      confirmMatchDecision(db, right),
    ]);
    const statuses = [leftResult.status, rightResult.status].sort();
    expect(statuses).toEqual(['CONFIRMED', 'CONFLICT']);
    expect(await db.documentMatch.count({ where: { transactionId: 6, status: { in: ['CONFIRMED', 'AUTO_CONFIRMED'] } } })).toBe(1);
    const loser = leftResult.status === 'CONFLICT' ? left : right;
    const winnerDocument = leftResult.status === 'CONFIRMED' ? leftDocument : rightDocument;
    const loserDocument = leftResult.status === 'CONFLICT' ? leftDocument : rightDocument;
    expect((await db.document.findUniqueOrThrow({ where: { id: winnerDocument } })).status).toBe('MATCHED');
    expect((await db.documentMatch.findUniqueOrThrow({ where: { id: loser } })).status).toBe('CANDIDATE');
    expect((await db.document.findUniqueOrThrow({ where: { id: loserDocument } })).status).toBe('NEEDS_REVIEW');
  });

  it('lets only one candidate confirm the same document', async () => {
    const documentId = await makeDocument('NEEDS_REVIEW');
    const left = await makeMatch(documentId, 12);
    const right = await makeMatch(documentId, 15);
    const [leftResult, rightResult] = await Promise.all([
      confirmMatchDecision(db, left),
      confirmMatchDecision(db, right),
    ]);
    expect([leftResult.status, rightResult.status].filter((status) => status === 'CONFIRMED')).toHaveLength(1);
    expect(await db.documentMatch.count({ where: { documentId, status: { in: ['CONFIRMED', 'AUTO_CONFIRMED'] } } })).toBe(1);
    expect((await db.document.findUniqueOrThrow({ where: { id: documentId } })).status).toBe('MATCHED');
    const rows = await db.documentMatch.findMany({ where: { documentId } });
    expect(rows.every((row) => row.status === 'CONFIRMED' || row.status === 'REJECTED')).toBe(true);
  });

  it('lets only one of two requests confirm the same match', async () => {
    const documentId = await makeDocument('NEEDS_REVIEW');
    const matchId = await makeMatch(documentId, 9);
    const [first, second] = await Promise.all([
      confirmMatchDecision(db, matchId),
      confirmMatchDecision(db, matchId),
    ]);
    expect([first.status, second.status].sort()).toEqual(['ALREADY_CONFIRMED', 'CONFIRMED']);
    expect(await db.documentMatch.count({ where: { id: matchId, status: 'CONFIRMED' } })).toBe(1);
    expect((await db.document.findUniqueOrThrow({ where: { id: documentId } })).status).toBe('MATCHED');
  });

  it('lets automatic and manual confirmation compete for one transaction', async () => {
    const manualDocument = await makeDocument('NEEDS_REVIEW');
    const manualMatch = await makeMatch(manualDocument, 13);
    const autoDocument = await makeDocument('EXTRACTED');
    const autoResult: MatchResult = {
      outcome: 'AUTO_MATCHED',
      reason: 'AUTO',
      candidates: [{ transactionId: 13, confidence: 1, signals: { amount: 1 }, flags: [] }],
    };
    await Promise.all([
      confirmMatchDecision(db, manualMatch),
      persistOutcome(db, autoDocument, extraction, autoResult, new Date('2025-06-14T09:22:00Z')),
    ]);
    expect(await db.documentMatch.count({ where: { transactionId: 13, status: { in: ['CONFIRMED', 'AUTO_CONFIRMED'] } } })).toBe(1);
    const manual = await db.documentMatch.findUniqueOrThrow({ where: { id: manualMatch } });
    const auto = await db.document.findUniqueOrThrow({
      where: { id: autoDocument },
      include: { matches: true },
    });
    const winners = [manual.status, ...auto.matches.map((match) => match.status)].filter(
      (status) => status === 'CONFIRMED' || status === 'AUTO_CONFIRMED',
    );
    expect(winners).toHaveLength(1);
  });

  it('does not let a later processing write replace a reviewer confirmation', async () => {
    const documentId = await makeDocument('NEEDS_REVIEW');
    const matchId = await makeMatch(documentId, 3);
    expect((await confirmMatchDecision(db, matchId)).status).toBe('CONFIRMED');
    const stale: MatchResult = {
      outcome: 'AUTO_MATCHED',
      reason: 'AUTO',
      candidates: [{ transactionId: 3, confidence: 1, signals: { amount: 1 }, flags: [] }],
    };
    await persistOutcome(db, documentId, extraction, stale, new Date('2025-06-14T09:23:00Z'));
    const match = await db.documentMatch.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe('CONFIRMED');
    expect(match.decidedBy).toBe(REVIEWER_ID);
    expect((await db.document.findUniqueOrThrow({ where: { id: documentId } })).statusReason).toBe('REVIEWER_CONFIRMED');
  });
});
