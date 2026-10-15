import { merchantSimilarity } from '@/lib/matching/similarity';
import { normalizeMerchant } from '@/lib/matching/normalize';

describe('merchant normalization', () => {
  it('treats the acquirer fuel string and the invoice name as the same merchant', () => {
    expect(normalizeMerchant('ALFANAR FUEL ST 04 RUH')).toEqual(['alfanar', 'fuel', 'station']);
    expect(normalizeMerchant('Alfanar Fuel Station')).toEqual(['alfanar', 'fuel', 'station']);
    expect(merchantSimilarity('ALFANAR FUEL ST 04 RUH', 'Alfanar Fuel Station')).toBe(1);
  });

  it('does not score a lone generic token as an exact longer name', () => {
    const score = merchantSimilarity('station', 'Alfanar Fuel Station');
    expect(score).not.toBeNull();
    expect(score as number).toBeLessThan(1);
  });

  it('keeps station inside a word and drops a city token', () => {
    expect(normalizeMerchant("The Chef's Table, Riyadh")).toEqual(['the', 'chefs', 'table']);
    expect(normalizeMerchant('BESTMART')).toEqual(['bestmart']);
  });
});
