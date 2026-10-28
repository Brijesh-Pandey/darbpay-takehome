import { parseReceiptText } from '@/lib/extraction/parse-receipt-text';
import { parseExtractedDocument } from '@/lib/extraction/schema';
import { readDocument, type OcrRead } from '@/lib/extraction/tesseract-reader';
import { ExtractionError, type DocumentExtractor, type ExtractedDocument } from '@/lib/extraction/types';

export type OcrReader = (file: Buffer, mimeType: string) => Promise<OcrRead>;

/** Live extractor. Tests pass a reader so the suite never starts Tesseract or opens a PDF. */
export class TesseractExtractor implements DocumentExtractor {
  constructor(private readonly read: OcrReader = readDocument) {}

  async extract(file: Buffer, mimeType: string): Promise<ExtractedDocument> {
    if (!Buffer.isBuffer(file)) {
      throw new ExtractionError('INVALID_INPUT', 'extract expects a Buffer of file bytes');
    }
    if (typeof mimeType !== 'string' || mimeType.trim() === '') {
      throw new ExtractionError('INVALID_INPUT', 'extract expects a MIME type string');
    }
    const read = await this.read(file, mimeType);
    return parseExtractedDocument(parseReceiptText(read.text, read.confidence));
  }
}
