import type { PrismaClient } from '@prisma/client';
import { MockExtractor } from '@/lib/extraction/mock-extractor';
import { parseExtractedDocument } from '@/lib/extraction/schema';
import { toExtractedFields } from '@/lib/extraction/to-fields';
import { ExtractionError, type DocumentExtractor } from '@/lib/extraction/types';
import type { CandidateTransaction } from '@/lib/matching/types';
import { getPrisma } from '@/lib/prisma';
import { findEmailClient } from '@/lib/services/sender-scope';
import { markFailed, persistOutcome, saveUnknownSender } from '@/lib/services/match-persistence';
import { matchDocument } from '@/lib/services/transaction-matcher';

const CLAIM_MS = 5 * 60 * 1000;

export type ProcessDeps = {
  db: PrismaClient;
  extractor: DocumentExtractor;
  now: () => Date;
};

const defaultExtractor = new MockExtractor();

export function defaultProcessDeps(overrides: Partial<ProcessDeps> = {}): ProcessDeps {
  return {
    db: overrides.db ?? getPrisma(),
    extractor: overrides.extractor ?? defaultExtractor,
    now: overrides.now ?? (() => new Date()),
  };
}

export async function processDocument(documentId: number, overrides: Partial<ProcessDeps> = {}): Promise<void> {
  const deps = defaultProcessDeps(overrides);
  const now = deps.now();
  const row = await deps.db.document.findUnique({ where: { id: documentId } });
  if (row === null || isTerminal(row.status)) return;

  const claimed = await deps.db.document.updateMany({
    where: { id: documentId, status: 'RECEIVED' },
    data: { status: 'EXTRACTED', processingStartedAt: now },
  });
  if (claimed.count === 0) {
    const staleBefore = new Date(now.getTime() - CLAIM_MS);
    const reclaimed = await deps.db.document.updateMany({
      where: {
        id: documentId,
        status: 'EXTRACTED',
        OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: staleBefore } }],
      },
      data: { processingStartedAt: now },
    });
    if (reclaimed.count === 0) return;
  }

  let extracted;
  try {
    extracted = parseExtractedDocument(await deps.extractor.extract(Buffer.from(row.content), row.mimeType));
  } catch (error) {
    const reason = error instanceof ExtractionError ? error.code : 'EXTRACTION_FAILED';
    await markFailed(deps.db, documentId, reason);
    return;
  }

  if (row.source === 'WHATSAPP') {
    await processWhatsApp(deps, documentId, extracted, row.senderIdentifier, now);
    return;
  }

  const client = await findEmailClient(deps.db, row.senderIdentifier);
  if (client === null) {
    await saveUnknownSender(deps.db, documentId, extracted);
    return;
  }

  const transactions = await loadClientCandidates(deps.db, client.clientId);
  const result = matchDocument(toExtractedFields(extracted), transactions, {
    kind: 'EMAIL',
    clientId: client.clientId,
  });
  await persistOutcome(deps.db, documentId, extracted, result, now);
}

async function processWhatsApp(
  deps: ProcessDeps,
  documentId: number,
  extracted: Awaited<ReturnType<typeof parseExtractedDocument>>,
  driverPhone: string,
  now: Date,
): Promise<void> {
  const known = await deps.db.transaction.count({ where: { driverPhone } });
  if (known === 0) {
    await saveUnknownSender(deps.db, documentId, extracted);
    return;
  }
  const transactions = await loadDriverCandidates(deps.db, driverPhone);
  const result = matchDocument(toExtractedFields(extracted), transactions, {
    kind: 'WHATSAPP',
    driverPhone,
  });
  await persistOutcome(deps.db, documentId, extracted, result, now);
}

function isTerminal(status: string): boolean {
  return status === 'MATCHED' || status === 'NEEDS_REVIEW' || status === 'UNMATCHED' || status === 'FAILED';
}

async function loadClientCandidates(db: PrismaClient, clientId: number): Promise<CandidateTransaction[]> {
  return loadCandidates(db, { clientId });
}

async function loadDriverCandidates(db: PrismaClient, driverPhone: string): Promise<CandidateTransaction[]> {
  return loadCandidates(db, { driverPhone });
}

async function loadCandidates(
  db: PrismaClient,
  where: { clientId: number } | { driverPhone: string },
): Promise<CandidateTransaction[]> {
  const rows = await db.transaction.findMany({
    where,
    include: {
      documents: {
        where: { status: { in: ['CONFIRMED', 'AUTO_CONFIRMED'] } },
        select: { id: true },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    clientId: row.clientId,
    driverPhone: row.driverPhone,
    merchantName: row.merchantName,
    amount: row.amount,
    currency: row.currency,
    transactionAt: row.transactionAt,
    cardLast4: row.cardLast4,
    hasConfirmedDocument: row.documents.length > 0,
  }));
}
