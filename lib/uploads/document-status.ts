import type { PrismaClient } from '@prisma/client';
import { formatHalalas, formatRiyadhDate, formatRiyadhDateTime, formatScore, missing, readSignals, reasonLabel, flagLabel } from '@/lib/review/format';

export type UploadMatchView = {
  status: string;
  statusLabel: string;
  confidenceLabel: string;
  flagLabels: string[];
  transactionMerchant: string;
  transactionAmount: string;
  transactionCard: string;
  transactionDate: string;
};

export type UploadStatus = {
  id: number;
  status: string;
  phase: 'reading' | 'done' | 'failed';
  reason: string;
  merchantName: string;
  amount: string;
  documentDate: string;
  cardLast4: string;
  invoiceNumber: string;
  vatNumber: string;
  documentType: string;
  extractionConfidence: string;
  rawText: string;
  filename: string;
  mimeType: string;
  preview: boolean;
  match: UploadMatchView | null;
};

const MATCH_STATUS_LABELS: Record<string, string> = {
  CANDIDATE: 'Open',
  REJECTED: 'Rejected',
  CONFIRMED: 'Confirmed',
  AUTO_CONFIRMED: 'Confirmed automatically',
};

export async function loadUploadStatus(db: PrismaClient, documentId: number): Promise<UploadStatus | null> {
  const row = await db.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      status: true,
      statusReason: true,
      filename: true,
      mimeType: true,
      content: true,
      documentType: true,
      merchantName: true,
      totalAmount: true,
      currency: true,
      documentDate: true,
      cardLast4: true,
      invoiceNumber: true,
      vatNumber: true,
      extractionConfidence: true,
      rawText: true,
      matches: {
        orderBy: [{ confidence: 'desc' }, { id: 'asc' }],
        take: 1,
        select: {
          confidence: true,
          signals: true,
          status: true,
          transaction: {
            select: {
              merchantName: true,
              amount: true,
              currency: true,
              transactionAt: true,
              cardLast4: true,
            },
          },
        },
      },
    },
  });
  if (row === null) return null;

  const top = row.matches[0];
  const stored = top === undefined ? null : readSignals(top.signals);
  return {
    id: row.id,
    status: row.status,
    phase: phaseOf(row.status),
    vatNumber: missing(row.vatNumber),
    reason: row.status === 'RECEIVED' || row.status === 'EXTRACTED' ? 'Reading the page.' : reasonLabel(row.statusReason),
    merchantName: missing(row.merchantName),
    amount: formatHalalas(row.totalAmount, row.currency),
    documentDate: row.documentDate === null ? missing(null) : formatRiyadhDate(row.documentDate),
    cardLast4: missing(row.cardLast4),
    invoiceNumber: missing(row.invoiceNumber),
    documentType: missing(row.documentType),
    extractionConfidence: formatScore(row.extractionConfidence),
    rawText: (row.rawText ?? '').slice(0, 4000),
    filename: missing(row.filename),
    mimeType: row.mimeType,
    preview: isPreviewableImage(row.mimeType, row.content),
    match:
      top === undefined || stored === null
        ? null
        : {
            status: top.status,
            statusLabel: MATCH_STATUS_LABELS[top.status] ?? top.status,
            confidenceLabel: formatScore(top.confidence),
            flagLabels: stored.flags.map(flagLabel),
            transactionMerchant: top.transaction.merchantName,
            transactionAmount: formatHalalas(top.transaction.amount, top.transaction.currency),
            transactionCard: missing(top.transaction.cardLast4),
            transactionDate: formatRiyadhDateTime(top.transaction.transactionAt),
          },
  };
}

function phaseOf(status: string): UploadStatus['phase'] {
  if (status === 'RECEIVED' || status === 'EXTRACTED') return 'reading';
  if (status === 'FAILED') return 'failed';
  return 'done';
}

function isPreviewableImage(mimeType: string, content: Uint8Array): boolean {
  if (!mimeType.startsWith('image/') || content.length < 12) return false;
  const png = content[0] === 0x89 && content[1] === 0x50 && content[2] === 0x4e && content[3] === 0x47;
  const jpeg = content[0] === 0xff && content[1] === 0xd8;
  const webp = content[0] === 0x52 && content[1] === 0x49 && content[2] === 0x46 && content[3] === 0x46;
  return png || jpeg || webp;
}
