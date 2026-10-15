import { z } from 'zod';
import { ExtractionError, type ExtractedDocument } from '@/lib/extraction/types';

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isRealCalendarDay(value: string): boolean {
  const match = ISO_DAY.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

function isIsoDocumentDate(value: string): boolean {
  if (ISO_DAY.test(value)) return isRealCalendarDay(value);
  if (!ISO_TIMESTAMP.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

const text = z.string().trim().min(1);

export const extractedDocumentSchema = z
  .object({
    documentType: z.enum(['RECEIPT', 'TAX_INVOICE', 'UNKNOWN']),
    merchantName: text.nullable(),
    vatNumber: text.nullable(),
    totalAmount: z.number().int().positive().nullable(),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    documentDate: z.string().trim().refine(isIsoDocumentDate, 'Expected an ISO 8601 date').nullable(),
    cardLast4: z
      .string()
      .trim()
      .regex(/^\d{4}$/)
      .nullable(),
    invoiceNumber: text.nullable(),
    rawText: z.string(),
    extractionConfidence: z.number().gte(0).lte(1),
  })
  .strict();

export function parseExtractedDocument(value: unknown): ExtractedDocument {
  const parsed = extractedDocumentSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue === undefined || issue.path.length === 0 ? 'value' : issue.path.join('.');
    throw new ExtractionError('INVALID_OUTPUT', `Extraction failed validation at ${where}`);
  }
  return parsed.data;
}

/** Present VAT numbers are useful only when they are 15 digits. A short value does not reject the document (CON-008). */
export function isFifteenDigitVatNumber(value: string | null): boolean {
  return value !== null && /^\d{15}$/.test(value);
}
