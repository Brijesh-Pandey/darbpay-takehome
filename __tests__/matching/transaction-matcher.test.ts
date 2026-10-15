import { defaultMatchConfig, type MatchConfig } from '@/lib/matching/config';
import type { CandidateTransaction, ExtractedFields, MatchScope } from '@/lib/matching/types';
import { matchDocument } from '@/lib/services/transaction-matcher';

const emailScope: MatchScope = { kind: 'EMAIL', clientId: 1 };
const phoneScope: MatchScope = { kind: 'WHATSAPP', driverPhone: '+966551234567' };

function document(overrides: Partial<ExtractedFields> = {}): ExtractedFields {
  return {
    documentType: 'TAX_INVOICE',
    merchantName: 'Alfanar Fuel Station',
    totalAmount: 12500,
    currency: 'SAR',
    documentDate: '2025-06-14',
    cardLast4: '4242',
    extractionConfidence: 0.95,
    ...overrides,
  };
}

function transaction(overrides: Partial<CandidateTransaction> = {}): CandidateTransaction {
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

describe('matchDocument', () => {
  it('auto-matches one exact amount, merchant, date, and card', () => {
    const result = matchDocument(document(), [transaction()], emailScope);
    expect(result.outcome).toBe('AUTO_MATCHED');
    expect(result.reason).toBe('AUTO');
    expect(result.candidates.map((candidate) => candidate.transactionId)).toEqual([1]);
    expect(result.candidates[0]?.confidence).toBe(1);
    expect(result.candidates[0]?.signals).toEqual({ amount: 1, merchant: 1, cardLast4: 1, date: 1 });
  });

  it('auto-matches an exact amount and merchant when the card is absent and the day matches', () => {
    const result = matchDocument(document({ cardLast4: null }), [transaction({ cardLast4: null })], emailScope);
    expect(result.outcome).toBe('AUTO_MATCHED');
    expect(result.candidates[0]?.signals.cardLast4).toBeUndefined();
  });

  it('auto-matches an exact amount, merchant, and card when the document date is missing', () => {
    const result = matchDocument(document({ documentDate: null }), [transaction()], emailScope);
    expect(result.outcome).toBe('AUTO_MATCHED');
    expect(result.candidates[0]?.signals.date).toBeUndefined();
  });

  it('sends a same-day same-amount Albaik pair to review in id order', () => {
    const later = transaction({
      id: 3,
      merchantName: 'ALBAIK RUH 07',
      amount: 4800,
      transactionAt: new Date('2025-06-12T12:30:00.000Z'),
    });
    const earlier = transaction({
      id: 2,
      merchantName: 'ALBAIK RUH 12',
      amount: 4800,
      transactionAt: new Date('2025-06-12T12:00:00.000Z'),
    });
    const receipt = document({
      documentType: 'RECEIPT',
      merchantName: 'Albaik',
      totalAmount: 4800,
      documentDate: '2025-06-12',
    });
    const forward = matchDocument(receipt, [earlier, later], emailScope);
    const reversed = matchDocument(receipt, [later, earlier], emailScope);
    expect(forward).toEqual(reversed);
    expect(forward.outcome).toBe('NEEDS_REVIEW');
    expect(forward.reason).toBe('AMBIGUOUS');
    expect(forward.candidates.map((candidate) => candidate.transactionId)).toEqual([2, 3]);
  });

  it('ignores the other client twin and auto-matches the in-scope charge', () => {
    const twin = transaction({ id: 5, clientId: 2, driverPhone: '+966552333444' });
    const result = matchDocument(document(), [twin, transaction()], emailScope);
    expect(result.outcome).toBe('AUTO_MATCHED');
    expect(result.candidates.map((candidate) => candidate.transactionId)).toEqual([1]);
  });

  it('auto-matches only the driver phone on a WhatsApp scope', () => {
    const otherDriver = transaction({ id: 8, driverPhone: '+966550111222' });
    const result = matchDocument(document({ documentType: 'RECEIPT' }), [otherDriver, transaction()], phoneScope);
    expect(result.outcome).toBe('AUTO_MATCHED');
    expect(result.candidates.map((candidate) => candidate.transactionId)).toEqual([1]);
  });

  it('sends the 57.50 SAR receipt against the 63.25 SAR charge to review with a tip flag', () => {
    const result = matchDocument(
      document({
        documentType: 'RECEIPT',
        merchantName: "The Chef's Table",
        totalAmount: 5750,
        documentDate: '2025-06-10',
        cardLast4: '1881',
      }),
      [
        transaction({
          id: 4,
          merchantName: 'THE CHEFS TABLE RIYADH',
          amount: 6325,
          cardLast4: '1881',
          transactionAt: new Date('2025-06-10T18:00:00.000Z'),
        }),
      ],
      emailScope,
    );
    expect(result.outcome).toBe('NEEDS_REVIEW');
    expect(result.reason).toBe('TIP');
    expect(result.candidates[0]?.flags).toContain('TIP');
    expect(result.candidates[0]?.signals.amount).toBe(0.5);
    expect(result.candidates[0]?.transactionId).toBe(4);
  });

  it('does not auto-match a second document for a transaction that is already confirmed', () => {
    const result = matchDocument(document(), [transaction({ hasConfirmedDocument: true })], emailScope);
    expect(result.outcome).toBe('NEEDS_REVIEW');
    expect(result.reason).toBe('ALREADY_CONFIRMED');
    expect(result.candidates[0]?.flags).toContain('ALREADY_CONFIRMED');
  });

  it('returns unmatched when no in-scope transaction exists', () => {
    const result = matchDocument(document(), [transaction({ clientId: 2 })], emailScope);
    expect(result).toEqual({ outcome: 'UNMATCHED', reason: 'NO_CANDIDATE', candidates: [] });
  });

  it('returns unmatched for an unknown document or a null amount without throwing', () => {
    expect(matchDocument(document({ documentType: 'UNKNOWN', totalAmount: null }), [transaction()], emailScope)).toEqual({
      outcome: 'UNMATCHED',
      reason: 'UNKNOWN_DOCUMENT',
      candidates: [],
    });
    expect(matchDocument(document({ totalAmount: null }), [transaction()], emailScope).outcome).toBe('UNMATCHED');
    expect(matchDocument(document({ totalAmount: 0 }), [], emailScope).reason).toBe('AMOUNT_UNUSABLE');
    expect(matchDocument(document({ totalAmount: 12.5 }), [transaction()], emailScope).reason).toBe('AMOUNT_UNUSABLE');
  });

  it('does not treat a repeated transaction id as two candidates', () => {
    const charge = transaction();
    const result = matchDocument(document(), [charge, { ...charge }], emailScope);
    expect(result.outcome).toBe('AUTO_MATCHED');
    expect(result.candidates).toHaveLength(1);
  });

  it('sends a present date eight days away to review and still auto-matches a seven-day gap', () => {
    const far = matchDocument(document({ documentDate: '2025-06-06' }), [transaction()], emailScope);
    expect(far.outcome).toBe('NEEDS_REVIEW');
    expect(far.reason).toBe('DATE_DISAGREES');
    expect(far.candidates[0]?.signals.date).toBe(0);

    const near = matchDocument(document({ documentDate: '2025-06-07' }), [transaction()], emailScope);
    expect(near.outcome).toBe('AUTO_MATCHED');
    expect(near.candidates[0]?.signals.date).toBe(0.125);
  });

  it('uses the Riyadh calendar day when the UTC timestamp is still the previous evening', () => {
    const shifted = matchDocument(
      document(),
      [transaction({ transactionAt: new Date('2025-06-14T21:00:00.000Z') })],
      emailScope,
    );
    expect(shifted.candidates[0]?.signals.date).toBe(0.875);

    const sameDay = matchDocument(
      document(),
      [transaction({ transactionAt: new Date('2025-06-14T20:59:00.000Z') })],
      emailScope,
    );
    expect(sameDay.candidates[0]?.signals.date).toBe(1);
  });

  it('scores a few halalas as rounding and a charge below the receipt outside that band as no match', () => {
    const rounded = matchDocument(document({ totalAmount: 10000 }), [transaction({ amount: 10005 })], emailScope);
    expect(rounded.candidates[0]?.signals.amount).toBe(0.9);
    expect(rounded.outcome).toBe('AUTO_MATCHED');

    const under = matchDocument(document({ totalAmount: 10000 }), [transaction({ amount: 9800 })], emailScope);
    expect(under.outcome).toBe('UNMATCHED');
  });

  it('blocks auto-match on a card mismatch and on low extraction confidence', () => {
    const card = matchDocument(document({ cardLast4: '9999' }), [transaction()], emailScope);
    expect(card.outcome).toBe('NEEDS_REVIEW');
    expect(card.reason).toBe('CARD_MISMATCH');
    expect(card.candidates[0]?.signals.cardLast4).toBe(0);

    const weak = matchDocument(document({ extractionConfidence: 0.59 }), [transaction()], emailScope);
    expect(weak.outcome).toBe('NEEDS_REVIEW');
    expect(weak.reason).toBe('LOW_EXTRACTION_CONFIDENCE');

    const enough = matchDocument(document({ extractionConfidence: 0.6 }), [transaction()], emailScope);
    expect(enough.outcome).toBe('AUTO_MATCHED');
  });

  it('does not auto-match on amount alone', () => {
    const result = matchDocument(
      document({ merchantName: null, cardLast4: null, documentDate: null }),
      [transaction()],
      emailScope,
    );
    expect(result.outcome).toBe('NEEDS_REVIEW');
    expect(result.reason).toBe('BELOW_THRESHOLD');
    expect(result.candidates[0]?.confidence).toBeLessThan(defaultMatchConfig.autoThreshold);
  });

  it('keeps at most five tied candidates, lowest ids first', () => {
    const charges = [15, 12, 10, 14, 11, 13].map((id) => transaction({ id }));
    const result = matchDocument(document(), charges, emailScope);
    expect(result.outcome).toBe('NEEDS_REVIEW');
    expect(result.candidates.map((candidate) => candidate.transactionId)).toEqual([10, 11, 12, 13, 14]);
  });

  it('treats a lead of exactly 0.10 as ambiguous and a larger lead as an auto-match', () => {
    const amountOnly: MatchConfig = {
      ...defaultMatchConfig,
      weights: { amount: 1, merchant: 0, cardLast4: 0, date: 0 },
      coverageFloor: 1,
    };
    const tied = matchDocument(
      document({ totalAmount: 10000, merchantName: null, cardLast4: null, documentDate: null }),
      [transaction({ id: 1, amount: 10000 }), transaction({ id: 2, amount: 10005 })],
      emailScope,
      amountOnly,
    );
    expect(tied.outcome).toBe('NEEDS_REVIEW');
    expect(tied.reason).toBe('AMBIGUOUS');
    expect(tied.candidates.map((candidate) => candidate.confidence)).toEqual([1, 0.9]);

    const clear = matchDocument(
      document(),
      [transaction({ id: 1, amount: 12500 }), transaction({ id: 4, amount: 13750 })],
      emailScope,
    );
    expect(clear.outcome).toBe('AUTO_MATCHED');
    expect(clear.candidates[0]?.transactionId).toBe(1);
    expect(clear.candidates.map((candidate) => candidate.transactionId)).toContain(4);
  });

  it('skips a different currency and an unreadable transaction timestamp', () => {
    const result = matchDocument(
      document(),
      [transaction({ id: 9, currency: 'USD' }), transaction({ id: 10, transactionAt: new Date('not-a-date') })],
      emailScope,
    );
    expect(result.outcome).toBe('UNMATCHED');
  });

  it('leaves an unreadable document date out of the score and can still auto-match', () => {
    const result = matchDocument(document({ documentDate: 'not-a-date' }), [transaction()], emailScope);
    expect(result.outcome).toBe('AUTO_MATCHED');
    expect(result.candidates[0]?.signals.date).toBeUndefined();
  });
});
