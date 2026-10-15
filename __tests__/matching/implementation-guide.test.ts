import fs from 'node:fs';
import { defaultMatchConfig } from '@/lib/matching/config';

describe('IMPLEMENTATION.md', () => {
  it('records the production weights and the auto-match threshold', () => {
    const guide = fs.readFileSync('IMPLEMENTATION.md', 'utf8');
    expect(guide).toContain('amount 0.40, merchant 0.25, card 0.20, date 0.15');
    expect(guide).toContain('0.85');
    expect(defaultMatchConfig.weights).toEqual({
      amount: 0.4,
      merchant: 0.25,
      cardLast4: 0.2,
      date: 0.15,
    });
    expect(defaultMatchConfig.autoThreshold).toBe(0.85);
    expect(defaultMatchConfig.tieMargin).toBe(0.1);
    expect(defaultMatchConfig.reviewFloor).toBe(0.5);
  });
});
