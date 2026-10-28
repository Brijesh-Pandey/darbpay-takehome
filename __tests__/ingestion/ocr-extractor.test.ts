import fs from 'node:fs';
import path from 'node:path';
import { createDocumentExtractor } from '@/lib/extraction/create-extractor';
import { MockExtractor } from '@/lib/extraction/mock-extractor';
import { mediaKind, PDF_TEXT_CONFIDENCE, readDocument } from '@/lib/extraction/tesseract-reader';
import { TesseractExtractor } from '@/lib/extraction/tesseract-extractor';
import { ExtractionError } from '@/lib/extraction/types';

describe('tesseract extractor', () => {
  it('maps a stubbed read into the extraction contract', async () => {
    const extractor = new TesseractExtractor(async () => ({
      text: 'Blue Bottle Coffee\nTOTAL $100.00\n2025-06-14',
      confidence: 0.91,
    }));
    await expect(extractor.extract(Buffer.from('image-bytes'), 'image/jpeg')).resolves.toMatchObject({
      documentType: 'RECEIPT',
      merchantName: 'Blue Bottle Coffee',
      totalAmount: 10000,
      currency: 'USD',
      documentDate: '2025-06-14',
      extractionConfidence: 0.91,
    });
  });

  it('rejects a call that is not a buffer or has no MIME type', async () => {
    const extractor = new TesseractExtractor(async () => ({ text: '', confidence: 0 }));
    const bytes: unknown = 'not-bytes';
    await expect(extractor.extract(bytes as Buffer, 'image/jpeg')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(extractor.extract(Buffer.from('x'), '  ')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('lets an unreadable file fail the document instead of inventing fields', async () => {
    const extractor = new TesseractExtractor(async () => {
      throw new ExtractionError('UNREADABLE', 'Tesseract could not read the image');
    });
    await expect(extractor.extract(Buffer.from('x'), 'image/png')).rejects.toMatchObject({ code: 'UNREADABLE' });
  });

  it('keeps the mock as the default and selects tesseract only by name', () => {
    expect(createDocumentExtractor({})).toBeInstanceOf(MockExtractor);
    expect(createDocumentExtractor({ EXTRACTOR: 'mock' })).toBeInstanceOf(MockExtractor);
    expect(createDocumentExtractor({ EXTRACTOR: ' Tesseract ' })).toBeInstanceOf(TesseractExtractor);
    expect(() => createDocumentExtractor({ EXTRACTOR: 'claude' })).toThrow(/EXTRACTOR/);
  });

  it('classifies photos and PDFs without starting an engine', async () => {
    expect(mediaKind('image/jpeg; charset=binary')).toBe('image');
    expect(mediaKind('application/pdf')).toBe('pdf');
    expect(mediaKind('text/plain')).toBe('unsupported');
    expect(PDF_TEXT_CONFIDENCE).toBeLessThan(0.6);
    await expect(readDocument(Buffer.from('not an image'), 'text/plain')).rejects.toMatchObject({ code: 'UNREADABLE' });
    await expect(readDocument(Buffer.alloc(0), 'image/png')).rejects.toMatchObject({ code: 'UNREADABLE' });
  });

  it('does not put the network, Prisma, or the clock in the parser', () => {
    for (const file of ['lib/extraction/parse-receipt-text.ts', 'lib/extraction/create-extractor.ts']) {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source).not.toContain('Date.now');
      expect(source).not.toContain('Math.random');
      expect(source).not.toMatch(/@prisma\/client/);
      expect(source).not.toMatch(/\bfetch\(/);
    }
  });
});