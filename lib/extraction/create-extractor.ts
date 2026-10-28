import { MockExtractor } from '@/lib/extraction/mock-extractor';
import { TesseractExtractor } from '@/lib/extraction/tesseract-extractor';
import type { DocumentExtractor } from '@/lib/extraction/types';

const mockExtractor = new MockExtractor();

/** `EXTRACTOR=tesseract` selects the live reader. Anything else, including an unset variable, stays on the mock. */
export function createDocumentExtractor(env: { EXTRACTOR?: string } = { EXTRACTOR: process.env.EXTRACTOR }): DocumentExtractor {
  const choice = (env.EXTRACTOR ?? '').trim().toLowerCase();
  if (choice === '' || choice === 'mock') return mockExtractor;
  if (choice === 'tesseract') return new TesseractExtractor();
  throw new Error('EXTRACTOR must be "mock" or "tesseract"');
}
