import fs from 'node:fs';
import path from 'node:path';
import { loadFixtureCatalog, type LoadedFixture } from '@/lib/extraction/fixtures';
import { sha256Hex } from '@/lib/extraction/hash';
import { MockExtractor } from '@/lib/extraction/mock-extractor';
import { isFifteenDigitVatNumber, parseExtractedDocument } from '@/lib/extraction/schema';
import { toExtractedFields } from '@/lib/extraction/to-fields';
import { ExtractionError, UNKNOWN_EXTRACTION, type DocumentExtractor, type ExtractedDocument } from '@/lib/extraction/types';

const catalog = loadFixtureCatalog();
const extractor = new MockExtractor(catalog);

function fixture(name: string): LoadedFixture {
  const found = catalog.find((item) => item.name === name);
  if (found === undefined) throw new Error(`Missing fixture ${name}`);
  return found;
}

async function read(name: string, mimeType = 'image/jpeg'): Promise<ExtractedDocument> {
  return extractor.extract(fixture(name).bytes, mimeType);
}

describe('mock extractor', () => {
  it('returns the exact Alfanar tax invoice in halalas', async () => {
    const result = await read('exact-alfanar', 'application/pdf');
    expect(result).toEqual({
      documentType: 'TAX_INVOICE',
      merchantName: 'Alfanar Fuel Station',
      vatNumber: '300000000000003',
      totalAmount: 12500,
      currency: 'SAR',
      documentDate: '2025-06-14',
      cardLast4: '4242',
      invoiceNumber: 'INV-99812',
      rawText: 'TAX INVOICE INV-99812 Alfanar Fuel Station VAT 300000000000003 TOTAL 125.00 SAR CARD 4242 2025-06-14',
      extractionConfidence: 0.96,
    });
    expect(isFifteenDigitVatNumber(result.vatNumber)).toBe(true);
    expect(toExtractedFields(result).totalAmount).toBe(12500);
  });

  it('returns the same object for the same bytes and a copy that the caller cannot corrupt', async () => {
    const bytes = fixture('exact-alfanar').bytes;
    const first = await extractor.extract(bytes, 'application/pdf');
    first.merchantName = 'changed';
    const second = await extractor.extract(bytes, 'text/plain');
    expect(second.merchantName).toBe('Alfanar Fuel Station');
    expect(second).toEqual(await new MockExtractor().extract(bytes, 'application/pdf'));
    expect(sha256Hex(bytes)).toBe(fixture('exact-alfanar').sha256);
  });

  it('treats a second photo with the same fields as a different file', async () => {
    const first = await read('exact-alfanar');
    const second = await read('alfanar-second-photo');
    expect(second).toEqual(first);
    expect(fixture('alfanar-second-photo').sha256).not.toBe(fixture('exact-alfanar').sha256);
  });

  it('returns UNKNOWN with a null amount for bytes that are not a fixture', async () => {
    const result = await extractor.extract(Buffer.from('not a committed fixture'), 'image/jpeg');
    expect(result).toEqual(UNKNOWN_EXTRACTION);
    const empty = await extractor.extract(Buffer.alloc(0), 'image/jpeg');
    expect(empty.documentType).toBe('UNKNOWN');
    expect(empty.totalAmount).toBeNull();
    expect(empty.extractionConfidence).toBe(0);
  });

  it('rejects a non-buffer and a missing MIME type', async () => {
    const bytes: unknown = 'not-bytes';
    await expect(extractor.extract(bytes as Buffer, 'image/jpeg')).rejects.toMatchObject({
      name: 'ExtractionError',
      code: 'INVALID_INPUT',
    });
    const mime: unknown = 12;
    await expect(extractor.extract(fixture('exact-alfanar').bytes, mime as string)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('throws UNREADABLE for the unreadable scan and does not throw for the garbage extraction', async () => {
    await expect(read('unreadable-scan')).rejects.toBeInstanceOf(ExtractionError);
    await expect(read('unreadable-scan')).rejects.toMatchObject({ code: 'UNREADABLE' });
    const garbage = await read('unreadable');
    expect(garbage.documentType).toBe('UNKNOWN');
    expect(garbage.totalAmount).toBeNull();
    expect(garbage.extractionConfidence).toBe(0);
  });

  it('keeps optional fields null when the scan did not contain them', async () => {
    const missingDate = await read('missing-date');
    expect(missingDate.documentDate).toBeNull();
    expect(missingDate.totalAmount).toBe(12500);
    const missingCard = await read('missing-card');
    expect(missingCard.cardLast4).toBeNull();
    const missingMerchant = await read('missing-merchant');
    expect(missingMerchant.merchantName).toBeNull();
    const unreadableAmount = await read('unreadable-amount');
    expect(unreadableAmount.totalAmount).toBeNull();
    expect(unreadableAmount.currency).toBeNull();
    expect(unreadableAmount.documentType).toBe('RECEIPT');
  });

  it('rejects amounts, currencies, dates, and cards that are not in the contract', () => {
    const valid = fixture('exact-alfanar');
    if (valid.kind !== 'result') throw new Error('exact fixture should extract');
    expect(() => parseExtractedDocument({ ...valid.result, totalAmount: 125.5 })).toThrow(ExtractionError);
    expect(() => parseExtractedDocument({ ...valid.result, currency: 'sar' })).toThrow(/currency/);
    expect(() => parseExtractedDocument({ ...valid.result, documentDate: '14/06/2025' })).toThrow(/documentDate/);
    expect(() => parseExtractedDocument({ ...valid.result, documentDate: '2025-02-31' })).toThrow(/documentDate/);
    expect(() => parseExtractedDocument({ ...valid.result, cardLast4: '424' })).toThrow(/cardLast4/);
    expect(() => parseExtractedDocument({ ...valid.result, extractionConfidence: 1.2 })).toThrow(/extractionConfidence/);
    expect(() => parseExtractedDocument({ ...valid.result, total: 12500 })).toThrow(ExtractionError);
  });

  it('does not reject a short VAT number, and does not pass that number to the matcher', () => {
    const valid = fixture('exact-alfanar');
    if (valid.kind !== 'result') throw new Error('exact fixture should extract');
    const parsed = parseExtractedDocument({ ...valid.result, vatNumber: '12345' });
    expect(isFifteenDigitVatNumber(parsed.vatNumber)).toBe(false);
    expect(toExtractedFields(parsed)).not.toHaveProperty('vatNumber');
  });

  it('refuses a fixture result that fails the schema', async () => {
    const exact = fixture('exact-alfanar');
    if (exact.kind !== 'result') throw new Error('exact fixture should extract');
    const broken: LoadedFixture = {
      ...exact,
      result: { ...exact.result, totalAmount: 12.5 } as ExtractedDocument,
    };
    const mock = new MockExtractor([broken]);
    await expect(mock.extract(exact.bytes, 'application/pdf')).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
  });

  it('accepts any DocumentExtractor, not only the mock', async () => {
    const fake: DocumentExtractor = {
      async extract() {
        return { ...UNKNOWN_EXTRACTION, rawText: 'fake' };
      },
    };
    const fields = toExtractedFields(await fake.extract(Buffer.from('x'), 'image/png'));
    expect(fields.documentType).toBe('UNKNOWN');
    expect(fields.extractionConfidence).toBe(0);
  });

  it('does not call the clock, random, Prisma, or the network', () => {
    for (const file of [
      'lib/extraction/types.ts',
      'lib/extraction/schema.ts',
      'lib/extraction/hash.ts',
      'lib/extraction/fixtures.ts',
      'lib/extraction/mock-extractor.ts',
      'lib/extraction/to-fields.ts',
    ]) {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source).not.toContain('Date.now');
      expect(source).not.toContain('Math.random');
      expect(source).not.toMatch(/@prisma\/client/);
      expect(source).not.toMatch(/\bfetch\(/);
    }
  });
});
