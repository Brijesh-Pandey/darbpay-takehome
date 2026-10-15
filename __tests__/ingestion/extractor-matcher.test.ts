import { loadFixtureCatalog, type LoadedFixture } from '@/lib/extraction/fixtures';
import { MockExtractor } from '@/lib/extraction/mock-extractor';
import { ExtractionError } from '@/lib/extraction/types';
import { toExtractedFields } from '@/lib/extraction/to-fields';
import type { CandidateTransaction, MatchScope } from '@/lib/matching/types';
import { matchDocument } from '@/lib/services/transaction-matcher';

const catalog = loadFixtureCatalog();
const extractor = new MockExtractor(catalog);
const emailScope: MatchScope = { kind: 'EMAIL', clientId: 1 };

function fixture(name: string): LoadedFixture {
  const found = catalog.find((item) => item.name === name);
  if (found === undefined) throw new Error(`Missing fixture ${name}`);
  return found;
}

function charge(overrides: Partial<CandidateTransaction> = {}): CandidateTransaction {
  return {
    id: 1,
    clientId: 1,
    driverPhone: '+966551234567',
    merchantName: 'ALFANAR FUEL ST 04 RUH',
    amount: 12500,
    currency: 'SAR',
    transactionAt: new Date('2025-06-14T09:21:00.000Z'),
    cardLast4: '4242',
    hasConfirmedDocument: false,
    ...overrides,
  };
}

const charges: CandidateTransaction[] = [
  charge(),
  charge({
    id: 2,
    merchantName: 'ALBAIK RUH 12',
    amount: 4800,
    transactionAt: new Date('2025-06-12T12:00:00.000Z'),
  }),
  charge({
    id: 3,
    merchantName: 'ALBAIK RUH 07',
    amount: 4800,
    transactionAt: new Date('2025-06-12T12:30:00.000Z'),
  }),
  charge({
    id: 4,
    merchantName: 'THE CHEFS TABLE RIYADH',
    amount: 6325,
    cardLast4: '1881',
    transactionAt: new Date('2025-06-10T18:00:00.000Z'),
  }),
  charge({ id: 5, clientId: 2, driverPhone: '+966552333444' }),
];

async function matched(name: string, scope: MatchScope = emailScope) {
  const extracted = await extractor.extract(fixture(name).bytes, 'application/octet-stream');
  return matchDocument(toExtractedFields(extracted), charges, scope);
}

describe('extractor output through matchDocument', () => {
  it('auto-matches the exact Alfanar invoice to transaction 1', async () => {
    const result = await matched('exact-alfanar');
    expect(result.outcome).toBe('AUTO_MATCHED');
    expect(result.reason).toBe('AUTO');
    expect(result.candidates.map((candidate) => candidate.transactionId)).toEqual([1]);
    expect(result.candidates[0]?.confidence).toBe(1);
  });

  it('sends the Albaik receipt to review with transactions 2 and 3', async () => {
    const result = await matched('albaik-ambiguous');
    expect(result.outcome).toBe('NEEDS_REVIEW');
    expect(result.reason).toBe('AMBIGUOUS');
    expect(result.candidates.map((candidate) => candidate.transactionId)).toEqual([2, 3]);
  });

  it('sends the 57.50 SAR receipt to review against the 63.25 SAR charge', async () => {
    const result = await matched('chefs-table-tip');
    expect(result.outcome).toBe('NEEDS_REVIEW');
    expect(result.reason).toBe('TIP');
    expect(result.candidates[0]?.transactionId).toBe(4);
    expect(result.candidates[0]?.signals.amount).toBe(0.5);
    expect(result.candidates[0]?.flags).toContain('TIP');
  });

  it('keeps a low-confidence exact read in review', async () => {
    const result = await matched('low-confidence');
    expect(result.outcome).toBe('NEEDS_REVIEW');
    expect(result.reason).toBe('LOW_EXTRACTION_CONFIDENCE');
    expect(result.candidates[0]?.transactionId).toBe(1);
  });

  it('auto-matches when the date or the card was not read', async () => {
    const missingDate = await matched('missing-date');
    expect(missingDate.outcome).toBe('AUTO_MATCHED');
    expect(missingDate.candidates[0]?.signals.date).toBeUndefined();
    const missingCard = await matched('missing-card');
    expect(missingCard.outcome).toBe('AUTO_MATCHED');
    expect(missingCard.candidates[0]?.signals.cardLast4).toBeUndefined();
  });

  it('omits an unreadable merchant and still auto-matches the exact amount, card, and day', async () => {
    const result = await matched('missing-merchant');
    expect(result.outcome).toBe('AUTO_MATCHED');
    expect(result.candidates[0]?.transactionId).toBe(1);
    expect(result.candidates[0]?.signals.merchant).toBeUndefined();
    expect(result.candidates[0]?.confidence).toBe(1);
  });

  it('does not match an unreadable amount or an UNKNOWN document', async () => {
    const amount = await matched('unreadable-amount');
    expect(amount).toEqual({ outcome: 'UNMATCHED', reason: 'AMOUNT_UNUSABLE', candidates: [] });
    const garbage = await matched('unreadable');
    expect(garbage).toEqual({ outcome: 'UNMATCHED', reason: 'UNKNOWN_DOCUMENT', candidates: [] });
  });

  it('leaves an invoice with no seeded charge unmatched', async () => {
    const result = await matched('missing-charge');
    expect(result).toEqual({ outcome: 'UNMATCHED', reason: 'NO_CANDIDATE', candidates: [] });
  });

  it('matches the second photo the same way without treating it as the same file', async () => {
    const first = await matched('exact-alfanar');
    const second = await matched('alfanar-second-photo');
    expect(second).toEqual(first);
    expect(fixture('alfanar-second-photo').sha256).not.toBe(fixture('exact-alfanar').sha256);
  });

  it('does not call the matcher when extraction throws', async () => {
    await expect(extractor.extract(fixture('unreadable-scan').bytes, 'image/jpeg')).rejects.toBeInstanceOf(ExtractionError);
  });

  it('uses the caller scope, which the extraction does not contain', async () => {
    const otherClient = await matched('exact-alfanar', { kind: 'EMAIL', clientId: 2 });
    expect(otherClient.outcome).toBe('AUTO_MATCHED');
    expect(otherClient.candidates.map((candidate) => candidate.transactionId)).toEqual([5]);
  });
});
