import type { ExtractedDocument } from '@/lib/extraction/types';
import type { ExtractedFields } from '@/lib/matching/types';

/** The matcher does not see VAT, the invoice number, or raw text. Nulls stay null. */
export function toExtractedFields(document: ExtractedDocument): ExtractedFields {
  return {
    documentType: document.documentType,
    merchantName: document.merchantName,
    totalAmount: document.totalAmount,
    currency: document.currency,
    documentDate: document.documentDate,
    cardLast4: document.cardLast4,
    extractionConfidence: document.extractionConfidence,
  };
}
