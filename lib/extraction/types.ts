/**
 * Assignment interface. A live provider implements DocumentExtractor.
 * MockExtractor stays the default so the app runs without an API key (ADR 0002).
 */
export interface ExtractedDocument {
  documentType: 'RECEIPT' | 'TAX_INVOICE' | 'UNKNOWN';
  merchantName: string | null;
  vatNumber: string | null; // 15-digit KSA VAT number, when present
  totalAmount: number | null; // minor units (halalas)
  currency: string | null; // ISO 4217
  documentDate: string | null; // ISO 8601
  cardLast4: string | null;
  invoiceNumber: string | null;
  rawText: string;
  extractionConfidence: number; // 0..1, the OCR's own confidence
}

export interface DocumentExtractor {
  extract(file: Buffer, mimeType: string): Promise<ExtractedDocument>;
}

export type ExtractionErrorCode = 'INVALID_INPUT' | 'UNREADABLE' | 'INVALID_OUTPUT';

export class ExtractionError extends Error {
  readonly code: ExtractionErrorCode;

  constructor(code: ExtractionErrorCode, message: string) {
    super(message);
    this.name = 'ExtractionError';
    this.code = code;
  }
}

/** Unknown bytes. Confidence 0 and a null amount, so the matcher returns UNMATCHED. */
export const UNKNOWN_EXTRACTION: ExtractedDocument = {
  documentType: 'UNKNOWN',
  merchantName: null,
  vatNumber: null,
  totalAmount: null,
  currency: null,
  documentDate: null,
  cardLast4: null,
  invoiceNumber: null,
  rawText: '',
  extractionConfidence: 0,
};
