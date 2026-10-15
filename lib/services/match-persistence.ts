import { Prisma, type PrismaClient } from '@prisma/client';
import type { ExtractedDocument } from '@/lib/extraction/types';
import type { MatchCandidate, MatchResult } from '@/lib/matching/types';

const TERMINAL = ['MATCHED', 'NEEDS_REVIEW', 'UNMATCHED', 'FAILED'] as const;

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function extractedColumns(document: ExtractedDocument) {
  return {
    documentType: document.documentType,
    merchantName: document.merchantName,
    vatNumber: document.vatNumber,
    totalAmount: document.totalAmount,
    currency: document.currency,
    documentDate: document.documentDate === null ? null : new Date(document.documentDate),
    cardLast4: document.cardLast4,
    invoiceNumber: document.invoiceNumber,
    rawText: document.rawText,
    extractionConfidence: document.extractionConfidence,
  };
}

function signalValue(candidate: MatchCandidate): Prisma.InputJsonValue {
  const signals: Record<string, number> = {};
  for (const [name, score] of Object.entries(candidate.signals)) {
    if (score !== undefined) signals[name] = score;
  }
  return { signals, flags: [...candidate.flags] };
}

export async function markFailed(db: PrismaClient, documentId: number, reason: string): Promise<void> {
  await db.document.updateMany({
    where: { id: documentId, status: 'EXTRACTED' },
    data: { status: 'FAILED', statusReason: reason },
  });
}

export async function saveUnknownSender(
  db: PrismaClient,
  documentId: number,
  extracted: ExtractedDocument,
): Promise<void> {
  await db.document.updateMany({
    where: { id: documentId, status: 'EXTRACTED' },
    data: {
      ...extractedColumns(extracted),
      status: 'UNMATCHED',
      statusReason: 'UNKNOWN_SENDER',
    },
  });
}

export async function persistOutcome(
  db: PrismaClient,
  documentId: number,
  extracted: ExtractedDocument,
  result: MatchResult,
  decidedAt: Date,
): Promise<void> {
  if (result.outcome === 'AUTO_MATCHED') {
    try {
      await writeMatches(db, documentId, extracted, result, 'MATCHED', 'AUTO', decidedAt);
      return;
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      await writeMatches(db, documentId, extracted, result, 'NEEDS_REVIEW', 'ALREADY_CONFIRMED', decidedAt, true);
      return;
    }
  }
  const status = result.outcome === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'UNMATCHED';
  await writeMatches(db, documentId, extracted, result, status, result.reason, decidedAt);
}

class RematchMoved extends Error {
  constructor() {
    super('document left UNMATCHED');
    this.name = 'RematchMoved';
  }
}

/** Moves an UNMATCHED document only. REJECTED rows stay. A lost auto-confirm is saved as review. */
export async function applyRematch(
  db: PrismaClient,
  documentId: number,
  result: MatchResult,
  decidedAt: Date,
): Promise<'updated' | 'skipped'> {
  if (result.outcome === 'UNMATCHED' || result.candidates.length === 0) return 'skipped';
  const status = result.outcome === 'AUTO_MATCHED' ? 'MATCHED' : 'NEEDS_REVIEW';
  const reason = result.outcome === 'AUTO_MATCHED' ? 'AUTO' : result.reason;
  try {
    await writeRematch(db, documentId, result, status, reason, decidedAt, false);
    return 'updated';
  } catch (error) {
    if (error instanceof RematchMoved) return 'skipped';
    if (!isUniqueConflict(error)) throw error;
    try {
      await writeRematch(db, documentId, result, 'NEEDS_REVIEW', 'ALREADY_CONFIRMED', decidedAt, true);
      return 'updated';
    } catch (retryError) {
      if (retryError instanceof RematchMoved) return 'skipped';
      throw retryError;
    }
  }
}

async function writeMatches(
  db: PrismaClient,
  documentId: number,
  extracted: ExtractedDocument,
  result: MatchResult,
  status: 'MATCHED' | 'NEEDS_REVIEW' | 'UNMATCHED',
  reason: string,
  decidedAt: Date,
  forceReview = false,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const current = await tx.document.findUnique({ where: { id: documentId }, select: { status: true } });
    if (current === null || TERMINAL.some((terminal) => terminal === current.status)) return;
    await tx.documentMatch.deleteMany({ where: { documentId } });
    for (const [index, candidate] of result.candidates.entries()) {
      const auto = !forceReview && status === 'MATCHED' && index === 0;
      await tx.documentMatch.create({
        data: {
          documentId,
          transactionId: candidate.transactionId,
          confidence: candidate.confidence,
          signals: signalValue(candidate),
          status: auto ? 'AUTO_CONFIRMED' : 'CANDIDATE',
          decidedBy: auto ? 'system' : null,
          decidedAt: auto ? decidedAt : null,
        },
      });
    }
    await tx.document.update({
      where: { id: documentId },
      data: {
        ...extractedColumns(extracted),
        status,
        statusReason: reason,
      },
    });
  });
}

async function writeRematch(
  db: PrismaClient,
  documentId: number,
  result: MatchResult,
  status: 'MATCHED' | 'NEEDS_REVIEW',
  reason: string,
  decidedAt: Date,
  forceReview: boolean,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const current = await tx.document.findUnique({ where: { id: documentId }, select: { status: true } });
    if (current === null || current.status !== 'UNMATCHED') throw new RematchMoved();
    await tx.documentMatch.deleteMany({ where: { documentId, status: 'CANDIDATE' } });
    const kept = await tx.documentMatch.findMany({
      where: { documentId },
      select: { transactionId: true },
    });
    const taken = new Set(kept.map((match) => match.transactionId));
    const fresh = result.candidates.filter((candidate) => !taken.has(candidate.transactionId));
    if (fresh.length === 0) throw new RematchMoved();
    for (const [index, candidate] of fresh.entries()) {
      const auto = !forceReview && status === 'MATCHED' && index === 0;
      await tx.documentMatch.create({
        data: {
          documentId,
          transactionId: candidate.transactionId,
          confidence: candidate.confidence,
          signals: signalValue(candidate),
          status: auto ? 'AUTO_CONFIRMED' : 'CANDIDATE',
          decidedBy: auto ? 'system' : null,
          decidedAt: auto ? decidedAt : null,
        },
      });
    }
    const moved = await tx.document.updateMany({
      where: { id: documentId, status: 'UNMATCHED' },
      data: { status, statusReason: reason },
    });
    if (moved.count === 0) throw new RematchMoved();
  });
}
