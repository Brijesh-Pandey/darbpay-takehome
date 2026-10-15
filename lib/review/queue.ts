import type { PrismaClient } from '@prisma/client';
import {
  candidateActions,
  flagLabel,
  formatHalalas,
  formatRiyadhDate,
  formatRiyadhDateTime,
  formatScore,
  missing,
  readSignals,
  reasonLabel,
  signalLabel,
  type SignalName,
} from '@/lib/review/format';

const SIGNAL_ORDER: SignalName[] = ['amount', 'merchant', 'cardLast4', 'date'];

export type ReviewSignal = {
  name: SignalName;
  label: string;
  score: string | null;
};

export type ReviewCandidateView = {
  matchId: number;
  rank: number;
  status: string;
  statusLabel: string;
  confidenceLabel: string;
  signals: ReviewSignal[];
  flagLabels: string[];
  canConfirm: boolean;
  canReject: boolean;
  blockedReason: string | null;
  transactionId: number;
  transactionMerchant: string;
  transactionAmount: string;
  transactionDate: string;
  transactionCard: string;
  clientName: string;
};

export type ReviewDocumentView = {
  id: number;
  status: 'NEEDS_REVIEW' | 'UNMATCHED';
  actionable: boolean;
  sourceLabel: string;
  sender: string;
  reason: string;
  openCandidateCount: number;
  merchantName: string;
  amount: string;
  documentDate: string;
  cardLast4: string;
  documentType: string;
  vatNumber: string;
  invoiceNumber: string;
  extractionConfidence: string;
  filename: string;
  mimeType: string;
  receivedAt: string;
  candidates: ReviewCandidateView[];
};

const MATCH_STATUS_LABELS: Record<string, string> = {
  CANDIDATE: 'Open',
  REJECTED: 'Rejected',
  CONFIRMED: 'Confirmed',
  AUTO_CONFIRMED: 'Confirmed automatically',
};

export async function loadReviewQueue(db: PrismaClient): Promise<ReviewDocumentView[]> {
  return loadDocuments(db, ['NEEDS_REVIEW']);
}

export async function loadReviewDesk(
  db: PrismaClient,
): Promise<{ needsReview: ReviewDocumentView[]; unmatched: ReviewDocumentView[] }> {
  const documents = await loadDocuments(db, ['NEEDS_REVIEW', 'UNMATCHED']);
  return {
    needsReview: documents.filter((document) => document.status === 'NEEDS_REVIEW'),
    unmatched: documents.filter((document) => document.status === 'UNMATCHED'),
  };
}

async function loadDocuments(
  db: PrismaClient,
  statuses: Array<'NEEDS_REVIEW' | 'UNMATCHED'>,
): Promise<ReviewDocumentView[]> {
  const rows = await db.document.findMany({
    where: { status: { in: statuses } },
    orderBy: { receivedAt: 'asc' },
    select: {
      id: true,
      status: true,
      source: true,
      senderIdentifier: true,
      statusReason: true,
      filename: true,
      mimeType: true,
      documentType: true,
      merchantName: true,
      vatNumber: true,
      totalAmount: true,
      currency: true,
      documentDate: true,
      cardLast4: true,
      invoiceNumber: true,
      extractionConfidence: true,
      receivedAt: true,
      matches: {
        orderBy: [{ confidence: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          confidence: true,
          signals: true,
          status: true,
          transaction: {
            select: {
              id: true,
              merchantName: true,
              amount: true,
              currency: true,
              transactionAt: true,
              cardLast4: true,
              client: { select: { name: true } },
              documents: {
                where: { status: { in: ['CONFIRMED', 'AUTO_CONFIRMED'] } },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const candidates = row.matches.map((match, index) => {
      const stored = readSignals(match.signals);
      const actions =
        row.status === 'NEEDS_REVIEW'
          ? candidateActions(match.status, match.transaction.documents.length > 0)
          : { canConfirm: false, canReject: false, blockedReason: null };
      return {
        matchId: match.id,
        rank: index + 1,
        status: match.status,
        statusLabel: MATCH_STATUS_LABELS[match.status] ?? match.status,
        confidenceLabel: formatScore(match.confidence),
        signals: SIGNAL_ORDER.map((name) => ({
          name,
          label: signalLabel(name),
          score: stored.signals[name] === undefined ? null : formatScore(stored.signals[name]),
        })),
        flagLabels: stored.flags.map(flagLabel),
        canConfirm: actions.canConfirm,
        canReject: actions.canReject,
        blockedReason: actions.blockedReason,
        transactionId: match.transaction.id,
        transactionMerchant: match.transaction.merchantName,
        transactionAmount: formatHalalas(match.transaction.amount, match.transaction.currency),
        transactionDate: formatRiyadhDateTime(match.transaction.transactionAt),
        transactionCard: missing(match.transaction.cardLast4),
        clientName: match.transaction.client.name,
      };
    });
    return {
      id: row.id,
      status: row.status === 'UNMATCHED' ? 'UNMATCHED' : 'NEEDS_REVIEW',
      actionable: row.status === 'NEEDS_REVIEW',
      sourceLabel: row.source === 'EMAIL' ? 'Email' : 'WhatsApp',
      sender: row.senderIdentifier,
      reason: reasonLabel(row.statusReason),
      openCandidateCount: candidates.filter((candidate) => candidate.status === 'CANDIDATE').length,
      merchantName: missing(row.merchantName),
      amount: formatHalalas(row.totalAmount, row.currency),
      documentDate: row.documentDate === null ? missing(null) : formatRiyadhDate(row.documentDate),
      cardLast4: missing(row.cardLast4),
      documentType: missing(row.documentType),
      vatNumber: missing(row.vatNumber),
      invoiceNumber: missing(row.invoiceNumber),
      extractionConfidence: formatScore(row.extractionConfidence),
      filename: missing(row.filename),
      mimeType: row.mimeType,
      receivedAt: formatRiyadhDateTime(row.receivedAt),
      candidates,
    };
  });
}
