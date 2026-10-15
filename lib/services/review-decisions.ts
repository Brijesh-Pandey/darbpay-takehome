import { Prisma, type DocumentStatus, type PrismaClient } from '@prisma/client';

export const REVIEWER_ID = 'reviewer';

export type DecisionStatus =
  | 'CONFIRMED'
  | 'REJECTED'
  | 'ALREADY_CONFIRMED'
  | 'ALREADY_REJECTED'
  | 'CONFLICT'
  | 'NOT_FOUND';

export type DecisionResult = {
  status: DecisionStatus;
  matchId: number;
  documentId?: number;
  documentStatus?: DocumentStatus;
};

type Tx = Prisma.TransactionClient;
type DecisionKind = 'confirm' | 'reject';

class DecisionConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecisionConflict';
  }
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isConfirmed(status: string): boolean {
  return status === 'CONFIRMED' || status === 'AUTO_CONFIRMED';
}

async function classify(tx: Tx, matchId: number, kind: DecisionKind): Promise<DecisionResult> {
  const match = await tx.documentMatch.findUnique({
    where: { id: matchId },
    select: { status: true, documentId: true, document: { select: { status: true } } },
  });
  if (match === null) return { status: 'NOT_FOUND', matchId };
  const known = { matchId, documentId: match.documentId, documentStatus: match.document.status };
  if (isConfirmed(match.status)) {
    return kind === 'confirm'
      ? { ...known, status: 'ALREADY_CONFIRMED' }
      : { ...known, status: 'CONFLICT' };
  }
  if (match.status === 'REJECTED') return { ...known, status: 'ALREADY_REJECTED' };
  return { ...known, status: 'CONFLICT' };
}

async function inScope(
  tx: Tx,
  document: { source: 'EMAIL' | 'WHATSAPP'; senderIdentifier: string },
  transaction: { clientId: number; driverPhone: string | null },
): Promise<boolean> {
  if (document.source === 'WHATSAPP') return transaction.driverPhone === document.senderIdentifier;
  const sender = await tx.clientEmailSender.findUnique({ where: { email: document.senderIdentifier } });
  return sender !== null && sender.clientId === transaction.clientId;
}

export async function confirmMatchDecision(
  db: PrismaClient,
  matchId: number,
  reviewer = REVIEWER_ID,
): Promise<DecisionResult> {
  try {
    return await db.$transaction(async (tx) => {
      const decidedAt = new Date();
      let confirmed: Prisma.BatchPayload;
      try {
        confirmed = await tx.documentMatch.updateMany({
          where: { id: matchId, status: 'CANDIDATE' },
          data: { status: 'CONFIRMED', decidedBy: reviewer, decidedAt },
        });
      } catch (error) {
        if (isUniqueConflict(error)) throw new DecisionConflict('confirmation already exists');
        throw error;
      }
      if (confirmed.count === 0) return classify(tx, matchId, 'confirm');

      const match = await tx.documentMatch.findUniqueOrThrow({
        where: { id: matchId },
        include: { document: true, transaction: true },
      });
      if (!(await inScope(tx, match.document, match.transaction))) {
        throw new DecisionConflict('match is outside the document scope');
      }
      await tx.documentMatch.updateMany({
        where: { documentId: match.documentId, status: 'CANDIDATE', id: { not: matchId } },
        data: { status: 'REJECTED', decidedBy: reviewer, decidedAt },
      });
      const moved = await tx.document.updateMany({
        where: { id: match.documentId, status: 'NEEDS_REVIEW' },
        data: { status: 'MATCHED', statusReason: 'REVIEWER_CONFIRMED' },
      });
      if (moved.count === 0) throw new DecisionConflict('document is not waiting for review');
      return {
        status: 'CONFIRMED',
        matchId,
        documentId: match.documentId,
        documentStatus: 'MATCHED',
      };
    });
  } catch (error) {
    if (error instanceof DecisionConflict) return { status: 'CONFLICT', matchId };
    throw error;
  }
}

export async function rejectMatchDecision(
  db: PrismaClient,
  matchId: number,
  reviewer = REVIEWER_ID,
): Promise<DecisionResult> {
  return db.$transaction(async (tx) => {
    const decidedAt = new Date();
    const rejected = await tx.documentMatch.updateMany({
      where: { id: matchId, status: 'CANDIDATE' },
      data: { status: 'REJECTED', decidedBy: reviewer, decidedAt },
    });
    if (rejected.count === 0) return classify(tx, matchId, 'reject');

    const match = await tx.documentMatch.findUniqueOrThrow({
      where: { id: matchId },
      select: { documentId: true },
    });
    await tx.document.updateMany({
      where: {
        id: match.documentId,
        status: 'NEEDS_REVIEW',
        matches: { none: { status: 'CANDIDATE' } },
      },
      data: { status: 'UNMATCHED', statusReason: 'ALL_CANDIDATES_REJECTED' },
    });
    const document = await tx.document.findUniqueOrThrow({
      where: { id: match.documentId },
      select: { status: true },
    });
    return {
      status: 'REJECTED',
      matchId,
      documentId: match.documentId,
      documentStatus: document.status,
    };
  });
}
