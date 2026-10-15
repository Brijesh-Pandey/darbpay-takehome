import { defaultMatchConfig, type MatchConfig } from '@/lib/matching/config';
import { round4 } from '@/lib/matching/round';
import { scoreAmount, scoreCard, scoreDate, scoreMerchant } from '@/lib/matching/signals';
import type {
  CandidateTransaction,
  ExtractedFields,
  MatchCandidate,
  MatchFlag,
  MatchReason,
  MatchResult,
  MatchScope,
  SignalName,
} from '@/lib/matching/types';

const SIGNAL_NAMES: readonly SignalName[] = ['amount', 'merchant', 'cardLast4', 'date'];

export function matchDocument(
  doc: ExtractedFields,
  transactions: readonly CandidateTransaction[],
  scope: MatchScope,
  config: MatchConfig = defaultMatchConfig,
): MatchResult {
  if (doc.documentType === 'UNKNOWN') return unmatched('UNKNOWN_DOCUMENT');
  if (!isUsableAmount(doc.totalAmount)) return unmatched('AMOUNT_UNUSABLE');
  const documentAmount = doc.totalAmount;

  const scored: MatchCandidate[] = [];
  const seen = new Set<number>();
  for (const transaction of transactions) {
    if (seen.has(transaction.id)) continue;
    seen.add(transaction.id);
    const candidate = scoreTransaction(doc, documentAmount, transaction, scope, config);
    if (candidate !== null) scored.push(candidate);
  }

  const ranked = scored
    .filter((candidate) => candidate.confidence >= config.reviewFloor)
    .sort((left, right) => right.confidence - left.confidence || left.transactionId - right.transactionId)
    .slice(0, config.maxCandidates);

  return decide(doc, ranked, config);
}

function scoreTransaction(
  doc: ExtractedFields,
  documentAmount: number,
  transaction: CandidateTransaction,
  scope: MatchScope,
  config: MatchConfig,
): MatchCandidate | null {
  if (!inScope(transaction, scope) || !isUsableTransaction(transaction)) return null;
  if (currenciesDiffer(doc.currency, transaction.currency)) return null;

  const amount = scoreAmount(documentAmount, transaction.amount, config);
  if (amount === null) return null;
  const merchant = scoreMerchant(doc.merchantName, transaction.merchantName, config.merchantMinimum);
  if (doc.merchantName !== null && doc.merchantName.trim() !== '' && merchant === null) return null;

  const signals: Partial<Record<SignalName, number>> = { amount: amount.score };
  if (merchant !== null) signals.merchant = merchant;
  const card = scoreCard(doc.cardLast4, transaction.cardLast4);
  if (card !== null) signals.cardLast4 = card;
  const date = scoreDate(doc.documentDate, transaction.transactionAt, config);
  if (date !== null) signals.date = date;

  const flags: MatchFlag[] = [];
  if (amount.tip) flags.push('TIP');
  if (card === 0) flags.push('CARD_MISMATCH');
  if (transaction.hasConfirmedDocument) flags.push('ALREADY_CONFIRMED');

  return {
    transactionId: transaction.id,
    confidence: combineSignals(signals, config),
    signals,
    flags,
  };
}

export function combineSignals(signals: Partial<Record<SignalName, number>>, config: MatchConfig): number {
  let weight = 0;
  let weighted = 0;
  for (const name of SIGNAL_NAMES) {
    const score = signals[name];
    const signalWeight = config.weights[name];
    if (score === undefined || signalWeight <= 0) continue;
    weight += signalWeight;
    weighted += signalWeight * score;
  }
  if (weight <= 0) return 0;
  const coverage = Math.min(1, weight / config.coverageFloor);
  return round4((weighted / weight) * coverage);
}

function decide(doc: ExtractedFields, ranked: readonly MatchCandidate[], config: MatchConfig): MatchResult {
  const top = ranked[0];
  if (top === undefined) return unmatched('NO_CANDIDATE');
  const next = ranked[1];
  const lead = next === undefined ? Number.POSITIVE_INFINITY : round4(top.confidence - next.confidence);
  const date = top.signals.date;
  const blocked =
    top.flags.includes('TIP') ||
    top.flags.includes('CARD_MISMATCH') ||
    top.flags.includes('ALREADY_CONFIRMED') ||
    (date !== undefined && date <= 0) ||
    !(doc.extractionConfidence >= config.minExtractionConfidence);
  const ambiguous = next !== undefined && lead <= config.tieMargin;
  if (!blocked && !ambiguous && top.confidence >= config.autoThreshold) {
    return { outcome: 'AUTO_MATCHED', reason: 'AUTO', candidates: [...ranked] };
  }
  return { outcome: 'NEEDS_REVIEW', reason: reviewReason(top, ambiguous, doc, config), candidates: [...ranked] };
}

function reviewReason(
  top: MatchCandidate,
  ambiguous: boolean,
  doc: ExtractedFields,
  config: MatchConfig,
): MatchReason {
  if (ambiguous) return 'AMBIGUOUS';
  if (top.flags.includes('ALREADY_CONFIRMED')) return 'ALREADY_CONFIRMED';
  if (top.flags.includes('TIP')) return 'TIP';
  if (top.flags.includes('CARD_MISMATCH')) return 'CARD_MISMATCH';
  if (top.signals.date === 0) return 'DATE_DISAGREES';
  if (!(doc.extractionConfidence >= config.minExtractionConfidence)) return 'LOW_EXTRACTION_CONFIDENCE';
  return 'BELOW_THRESHOLD';
}

function inScope(transaction: CandidateTransaction, scope: MatchScope): boolean {
  if (scope.kind === 'EMAIL') return transaction.clientId === scope.clientId;
  return transaction.driverPhone === scope.driverPhone;
}

function currenciesDiffer(documentCurrency: string | null, transactionCurrency: string): boolean {
  if (documentCurrency === null || documentCurrency.trim() === '') return false;
  return documentCurrency.trim().toUpperCase() !== transactionCurrency.trim().toUpperCase();
}

function isUsableAmount(value: number | null): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isUsableTransaction(transaction: CandidateTransaction): boolean {
  return (
    Number.isInteger(transaction.id) &&
    transaction.id > 0 &&
    Number.isInteger(transaction.amount) &&
    transaction.amount > 0 &&
    transaction.transactionAt instanceof Date &&
    !Number.isNaN(transaction.transactionAt.getTime()) &&
    transaction.currency.trim() !== ''
  );
}

function unmatched(reason: 'UNKNOWN_DOCUMENT' | 'AMOUNT_UNUSABLE' | 'NO_CANDIDATE'): MatchResult {
  return { outcome: 'UNMATCHED', reason, candidates: [] };
}
