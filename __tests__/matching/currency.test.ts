import { convertMinorUnits } from '@/lib/money/fx';
import { transactionsPayloadSchema } from '@/lib/webhooks/transactions-payload';

describe('currency conversion', () => {
  it('converts a pegged pair in minor units and leaves a floating currency alone', () => {
    expect(convertMinorUnits(10000, 'USD', 'SAR')).toBe(37500);
    expect(convertMinorUnits(37500, 'SAR', 'USD')).toBe(10000);
    expect(convertMinorUnits(10000, 'usd', 'sar')).toBe(37500);
    expect(convertMinorUnits(10000, 'USD', 'AED')).toBe(36725);
    expect(convertMinorUnits(1000, 'JPY', 'JPY')).toBe(1000);
    expect(convertMinorUnits(10000, 'EUR', 'SAR')).toBeNull();
    expect(convertMinorUnits(10000, 'XYZ', 'SAR')).toBeNull();
  });

  it('accepts a known charge currency and rejects an unknown one', () => {
    const charge = {
      externalRef: 'ch_1',
      clientId: 1,
      cardLast4: '4242',
      merchantName: 'Shop',
      amount: 10000,
      transactionAt: '2025-06-14T09:21:00.000Z',
    };
    const usd = transactionsPayloadSchema.safeParse({ transactions: [{ ...charge, currency: 'usd' }] });
    expect(usd.success).toBe(true);
    if (usd.success) expect(usd.data.transactions[0]?.currency).toBe('USD');

    const unknown = transactionsPayloadSchema.safeParse({ transactions: [{ ...charge, currency: 'XYZ' }] });
    expect(unknown.success).toBe(false);
  });
});
