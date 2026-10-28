import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  candidateActions,
  decisionMessage,
  formatHalalas,
  formatRiyadhDate,
  formatRiyadhDateTime,
  formatScore,
  missing,
  outcomeFromAction,
} from '@/lib/review/format';
import { loadReviewDesk, loadReviewQueue } from '@/lib/review/queue';
import { seedReferenceData } from '../../prisma/seed';

const databaseFile = path.resolve(process.cwd(), '.test-db/review-queue.db');
const databaseUrl = `file:${databaseFile}`;

describe('review formatting', () => {
  it('formats halalas with integer arithmetic and leaves missing values blank', () => {
    expect(formatHalalas(12500, 'SAR')).toBe('SAR 125.00');
    expect(formatHalalas(6325, 'SAR')).toBe('SAR 63.25');
    expect(formatHalalas(5, 'SAR')).toBe('SAR 0.05');
    expect(formatHalalas(null, 'SAR')).toBe('Not extracted');
    expect(missing('')).toBe('Not extracted');
    expect(missing('Albaik')).toBe('Albaik');
  });

  it('renders dates in the Riyadh calendar', () => {
    expect(formatRiyadhDate(new Date('2025-06-14T21:00:00.000Z'))).toBe('15 Jun 2025');
    expect(formatRiyadhDateTime(new Date('2025-06-14T09:21:00.000Z'))).toBe('14 Jun 2025, 12:21');
  });

  it('shows a match score between 0 and 1', () => {
    expect(formatScore(0.91)).toBe('0.9100');
    expect(formatScore(1)).toBe('1.0000');
    expect(formatScore(null)).toBe('Not extracted');
  });

  it('hides confirm when the transaction is already confirmed and explains every action result', () => {
    expect(candidateActions('CANDIDATE', false)).toEqual({
      canConfirm: true,
      canReject: true,
      blockedReason: null,
    });
    expect(candidateActions('CANDIDATE', true).canConfirm).toBe(false);
    expect(candidateActions('REJECTED', false)).toEqual({
      canConfirm: false,
      canReject: false,
      blockedReason: null,
    });
    expect(decisionMessage({ status: 'CONFIRMED' }).tone).toBe('success');
    expect(decisionMessage({ status: 'REJECTED', documentStatus: 'UNMATCHED' }).text).toContain('unmatched');
    expect(decisionMessage({ status: 'CONFLICT' }).text).toContain('Refresh');
    expect(decisionMessage({ status: 'ALREADY_CONFIRMED' }).tone).toBe('warning');
    expect(decisionMessage({ status: 'ALREADY_REJECTED' }).tone).toBe('warning');
    expect(decisionMessage({ status: 'NOT_FOUND' }).tone).toBe('warning');
    expect(outcomeFromAction(undefined).tone).toBe('error');
    expect(outcomeFromAction({ serverError: 'REVIEW_FAILED' }).tone).toBe('error');
    expect(outcomeFromAction({ data: { status: 'CONFIRMED' } }).tone).toBe('success');
  });

  it('keeps database access out of the browser components', () => {
    const board = fs.readFileSync(path.join(process.cwd(), 'app/review/review-board.tsx'), 'utf8');
    const card = fs.readFileSync(path.join(process.cwd(), 'app/review/document-card.tsx'), 'utf8');
    expect(board.includes('getPrisma')).toBe(false);
    expect(board.includes('@prisma/client')).toBe(false);
    expect(card.includes('getPrisma')).toBe(false);
    expect(card.includes('@prisma/client')).toBe(false);
    expect(board.includes('confirmMatch')).toBe(true);
    expect(board.includes('rejectMatch')).toBe(true);
  });
});

describe('review queue', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    fs.rmSync(databaseFile, { force: true });
    fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
    execFileSync(path.join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
    db = new PrismaClient({ datasourceUrl: databaseUrl });
    await seedReferenceData(db);
  }, 60_000);

  afterAll(async () => {
    await db.$disconnect();
    fs.rmSync(databaseFile, { force: true });
    fs.rmSync(`${databaseFile}-journal`, { force: true });
  });

  it('lists only documents that need review and only their own candidates', async () => {
    const review = await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'queue-review',
        scope: 'EMAIL:billing@alfanar-fuel.com.sa',
        contentHash: 'queue-review-hash',
        senderIdentifier: 'billing@alfanar-fuel.com.sa',
        status: 'NEEDS_REVIEW',
        statusReason: 'AMBIGUOUS',
        mimeType: 'image/jpeg',
        filename: 'media_albaik',
        content: new Uint8Array(Buffer.from('queue')),
        documentType: 'RECEIPT',
        merchantName: 'Albaik',
        totalAmount: 4800,
        currency: 'SAR',
        documentDate: new Date('2025-06-12T00:00:00.000Z'),
        cardLast4: '4242',
        extractionConfidence: 0.91,
        matches: {
          create: [
            {
              transactionId: 2,
              confidence: 0.91,
              signals: { signals: { amount: 1, merchant: 1, date: 1, cardLast4: 1 }, flags: [] },
              status: 'CANDIDATE',
            },
            {
              transactionId: 3,
              confidence: 0.9,
              signals: { signals: { amount: 1, merchant: 0.8 }, flags: ['TIP'] },
              status: 'CANDIDATE',
            },
          ],
        },
      },
    });
    await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'queue-matched',
        scope: 'EMAIL:billing@redsea-haulage.example',
        contentHash: 'queue-matched-hash',
        senderIdentifier: 'billing@redsea-haulage.example',
        status: 'MATCHED',
        mimeType: 'application/pdf',
        content: new Uint8Array(Buffer.from('matched')),
        merchantName: 'Hidden client',
        matches: {
          create: {
            transactionId: 5,
            confidence: 1,
            signals: { signals: { amount: 1 }, flags: [] },
            status: 'AUTO_CONFIRMED',
            decidedBy: 'system',
          },
        },
      },
    });

    const queue = await loadReviewQueue(db);
    expect(queue.map((document) => document.id)).toEqual([review.id]);
    const view = queue[0];
    if (view === undefined) throw new Error('missing review document');
    expect(view.merchantName).toBe('Albaik');
    expect(view.amount).toBe('SAR 48.00');
    expect(view.reason).toContain('close');
    expect(view.openCandidateCount).toBe(2);
    expect(view.candidates.map((candidate) => candidate.transactionId)).toEqual([2, 3]);
    expect(view.candidates.every((candidate) => candidate.canConfirm && candidate.canReject)).toBe(true);
    expect(view.candidates[1]?.flagLabels).toContain('Tip or similar amount gap');
    expect(JSON.stringify(queue).includes('Hidden client')).toBe(false);
    expect(JSON.stringify(queue).includes('Red Sea')).toBe(false);
  });

  it('marks missing extraction and refuses a second confirm', async () => {
    await db.documentMatch.create({
      data: {
        documentId: (
          await db.document.create({
            data: {
              source: 'EMAIL',
              externalId: 'queue-holder',
              scope: 'EMAIL:holder@example.com',
              contentHash: 'queue-holder-hash',
              senderIdentifier: 'holder@example.com',
              status: 'MATCHED',
              mimeType: 'application/pdf',
              content: new Uint8Array(Buffer.from('holder')),
            },
          })
        ).id,
        transactionId: 4,
        confidence: 1,
        signals: { signals: {}, flags: [] },
        status: 'CONFIRMED',
        decidedBy: 'reviewer',
      },
    });
    const open = await db.document.create({
      data: {
        source: 'WHATSAPP',
        externalId: 'queue-open',
        scope: 'WHATSAPP:+966551234567',
        contentHash: 'queue-open-hash',
        senderIdentifier: '+966551234567',
        status: 'NEEDS_REVIEW',
        statusReason: 'ALREADY_CONFIRMED',
        mimeType: 'image/jpeg',
        content: new Uint8Array(Buffer.from('open')),
        merchantName: null,
        totalAmount: null,
        matches: {
          create: [
            {
              transactionId: 4,
              confidence: 0.8,
              signals: { signals: { amount: 0.5 }, flags: ['ALREADY_CONFIRMED'] },
              status: 'CANDIDATE',
            },
            {
              transactionId: 6,
              confidence: 0.2,
              signals: { signals: {}, flags: [] },
              status: 'REJECTED',
              decidedBy: 'reviewer',
            },
          ],
        },
      },
    });

    const queue = await loadReviewQueue(db);
    const view = queue.find((document) => document.id === open.id);
    if (view === undefined) throw new Error('missing open document');
    expect(view.merchantName).toBe('Not extracted');
    expect(view.amount).toBe('Not extracted');
    const taken = view.candidates.find((candidate) => candidate.transactionId === 4);
    const rejected = view.candidates.find((candidate) => candidate.transactionId === 6);
    expect(taken?.canConfirm).toBe(false);
    expect(taken?.canReject).toBe(true);
    expect(taken?.blockedReason).toContain('already has a confirmed document');
    expect(rejected?.canConfirm).toBe(false);
    expect(rejected?.canReject).toBe(false);
  });

  it('lists unmatched documents without confirm or reject', async () => {
    const unmatched = await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'queue-unmatched',
        scope: 'EMAIL:billing@northline-logistics.example',
        contentHash: 'queue-unmatched-hash',
        senderIdentifier: 'billing@northline-logistics.example',
        status: 'UNMATCHED',
        statusReason: 'ALL_CANDIDATES_REJECTED',
        mimeType: 'application/pdf',
        content: new Uint8Array(Buffer.from('unmatched')),
        merchantName: 'Jarir',
        matches: {
          create: {
            transactionId: 7,
            confidence: 0.7,
            signals: { signals: { amount: 0.7 }, flags: [] },
            status: 'CANDIDATE',
          },
        },
      },
    });

    const desk = await loadReviewDesk(db);
    expect(desk.needsReview.some((document) => document.status === 'UNMATCHED')).toBe(false);
    expect(desk.unmatched.map((document) => document.id)).toContain(unmatched.id);
    expect(desk.needsReview.map((document) => document.id)).not.toContain(unmatched.id);
    const view = desk.unmatched.find((document) => document.id === unmatched.id);
    if (view === undefined) throw new Error('missing unmatched document');
    expect(view.actionable).toBe(false);
    expect(view.reason).toBe('Every candidate was rejected.');
    expect(view.candidates.every((candidate) => candidate.canConfirm === false && candidate.canReject === false)).toBe(
      true,
    );
    expect(JSON.stringify(desk.needsReview).includes('Hidden client')).toBe(false);
    expect(JSON.stringify(desk.unmatched).includes('Hidden client')).toBe(false);
    expect(desk.matched.some((document) => document.merchantName === 'Hidden client')).toBe(true);
    expect(desk.matched.find((document) => document.merchantName === 'Hidden client')?.actionable).toBe(false);
  });
});
