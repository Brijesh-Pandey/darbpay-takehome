import type { SignalName } from '@/lib/matching/types';

export type MatchConfig = {
  weights: Record<SignalName, number>;
  coverageFloor: number;
  autoThreshold: number;
  reviewFloor: number;
  tieMargin: number;
  maxCandidates: number;
  minExtractionConfidence: number;
  merchantMinimum: number;
  tipRatio: number;
  roundingHalalas: number;
  roundingRatio: number;
  dateZeroFromDays: number;
  dateDivisor: number;
};

export const defaultMatchConfig: MatchConfig = {
  weights: {
    amount: 0.4,
    merchant: 0.25,
    cardLast4: 0.2,
    date: 0.15,
  },
  coverageFloor: 0.75,
  autoThreshold: 0.85,
  reviewFloor: 0.5,
  tieMargin: 0.1,
  maxCandidates: 5,
  minExtractionConfidence: 0.6,
  merchantMinimum: 0.25,
  tipRatio: 0.2,
  roundingHalalas: 5,
  roundingRatio: 0.01,
  dateZeroFromDays: 8,
  dateDivisor: 8,
};
