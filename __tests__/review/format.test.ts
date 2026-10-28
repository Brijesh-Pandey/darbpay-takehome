import {
  candidateActions,
  decisionMessage,
  formatHalalas,
  formatRiyadhDate,
  formatRiyadhDateTime,
  formatScore,
  missing,
  outcomeFromAction,
  readSignals,
  reasonLabel,
} from '@/lib/review/format';

describe('review formatting', () => {
  it('formats halalas without a floating-point amount', () => {
    expect(formatHalalas(12500, 'SAR')).toBe('SAR 125.00');
    expect(formatHalalas(5, 'SAR')).toBe('SAR 0.05');
    expect(formatHalalas(0, null)).toBe('SAR 0.00');
    expect(formatHalalas(null, 'SAR')).toBe('Not extracted');
    expect(formatHalalas(12.5, 'SAR')).toBe('Not extracted');
    expect(formatHalalas(10000, 'USD')).toBe('USD 100.00');
    expect(formatHalalas(1000, 'JPY')).toBe('JPY 1000');
    expect(formatHalalas(1500, 'KWD')).toBe('KWD 1.500');
    expect(formatHalalas(10000, null)).toBe('SAR 100.00');
  });

  it('shows a Riyadh calendar date and clock time', () => {
    const evening = new Date('2025-06-14T21:30:00.000Z');
    expect(formatRiyadhDate(evening)).toBe('15 Jun 2025');
    expect(formatRiyadhDateTime(evening)).toBe('15 Jun 2025, 00:30');
    expect(formatRiyadhDate(new Date('2025-06-12T00:00:00.000Z'))).toBe('12 Jun 2025');
  });

  it('labels missing extraction and a stored review reason', () => {
    expect(missing(null)).toBe('Not extracted');
    expect(missing('  ')).toBe('Not extracted');
    expect(reasonLabel('AMBIGUOUS')).toBe('Two candidates scored too close to choose automatically.');
    expect(reasonLabel('ALL_CANDIDATES_REJECTED')).toBe('Every candidate was rejected.');
    expect(reasonLabel(null)).toBe('This document is waiting for a decision.');
    expect(formatScore(null)).toBe('Not extracted');
    expect(formatScore(0)).toBe('0.0000');
    expect(formatScore(1)).toBe('1.0000');
  });

  it('reads only known signal numbers', () => {
    expect(readSignals({ signals: { amount: 1, merchant: 'high', date: 0 }, flags: ['TIP', 1] })).toEqual({
      signals: { amount: 1, date: 0 },
      flags: ['TIP'],
    });
    expect(readSignals(null)).toEqual({ signals: {}, flags: [] });
  });

  it('does not offer confirm on a closed or already confirmed candidate', () => {
    expect(candidateActions('CANDIDATE', false)).toEqual({
      canConfirm: true,
      canReject: true,
      blockedReason: null,
    });
    expect(candidateActions('CANDIDATE', true).canConfirm).toBe(false);
    expect(candidateActions('REJECTED', false)).toEqual({
      canConfirm: false,
      canReject: false,
      blockedReason: null,
    });
  });

  it('reports success only when the server saved the decision', () => {
    expect(decisionMessage({ status: 'CONFIRMED' }).tone).toBe('success');
    expect(decisionMessage({ status: 'REJECTED', documentStatus: 'UNMATCHED' }).text).toMatch(/unmatched/);
    expect(decisionMessage({ status: 'CONFLICT' }).tone).toBe('warning');
    expect(decisionMessage({ status: 'ALREADY_CONFIRMED' }).text).toMatch(/already confirmed/);
    expect(decisionMessage({ status: 'ALREADY_REJECTED' }).text).toMatch(/already rejected/);
    expect(decisionMessage({ status: 'NOT_FOUND' }).tone).toBe('warning');
    expect(outcomeFromAction({ serverError: 'REVIEW_FAILED' })).toEqual({
      tone: 'error',
      text: 'The decision could not be saved. Nothing was changed.',
    });
    expect(outcomeFromAction({ validationErrors: { matchId: ['Required'] } }).tone).toBe('error');
    expect(outcomeFromAction({ data: { status: 'CONFLICT' } }).text).not.toMatch(/^Confirmed/);
  });
});
