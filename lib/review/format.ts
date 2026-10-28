import type { DocumentStatus } from '@prisma/client';
import { canonicalCurrency, DEFAULT_CURRENCY, minorUnitExponent } from '@/lib/money/currencies';
import type { DecisionStatus } from '@/lib/services/review-decisions';

const RIYADH = 'Asia/Riyadh';

const REASON_LABELS: Record<string, string> = {
  AMBIGUOUS: 'Two candidates scored too close to choose automatically.',
  ALREADY_CONFIRMED: 'The leading transaction already has a confirmed document.',
  TIP: 'The receipt amount and the card charge differ by about a tip.',
  FX: 'The receipt and the charge use different currencies. Confirm the converted amount.',
  CARD_MISMATCH: 'The card on the receipt does not match the charge.',
  DATE_DISAGREES: 'The receipt date and the charge date are far apart.',
  LOW_EXTRACTION_CONFIDENCE: 'The extraction confidence is too low to attach automatically.',
  BELOW_THRESHOLD: 'The best score is below the automatic threshold.',
  UNKNOWN_DOCUMENT: 'The extraction did not identify a receipt or invoice.',
  AMOUNT_UNUSABLE: 'The amount could not be read.',
  NO_CANDIDATE: 'No charge in this sender scope was close enough.',
  UNKNOWN_SENDER: 'The sender is not a known client or driver.',
  ALL_CANDIDATES_REJECTED: 'Every candidate was rejected.',
  AUTO: 'The receipt matched one charge clearly, so it was attached.',
};

const FLAG_LABELS: Record<string, string> = {
  TIP: 'Tip or similar amount gap',
  FX: 'Converted into the charge currency',
  CARD_MISMATCH: 'Card does not match',
  ALREADY_CONFIRMED: 'Transaction already confirmed',
};

const SIGNAL_LABELS = {
  amount: 'Amount',
  merchant: 'Merchant',
  cardLast4: 'Card last four',
  date: 'Date',
} as const;

export type SignalName = keyof typeof SIGNAL_LABELS;

export type StoredSignals = {
  signals: Partial<Record<SignalName, number>>;
  flags: string[];
};

export type ReviewNotice = {
  tone: 'success' | 'warning' | 'error';
  text: string;
};

const MISSING = 'Not extracted';

export function missing(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === '') return MISSING;
  return value;
}

export function formatHalalas(amount: number | null, currency: string | null): string {
  if (amount === null || !Number.isInteger(amount)) return MISSING;
  const blank = currency === null || currency.trim() === '';
  const code = blank ? DEFAULT_CURRENCY : currency.trim().toUpperCase();
  const exponent = canonicalCurrency(code) === null ? null : minorUnitExponent(code);
  const sign = amount < 0 ? '-' : '';
  const absolute = Math.abs(amount);
  if (exponent === null) return `${sign}${code} ${absolute}`;
  if (exponent === 0) return `${sign}${code} ${absolute}`;
  const scale = 10 ** exponent;
  const major = Math.floor(absolute / scale);
  const minor = absolute % scale;
  return `${sign}${code} ${major}.${minor.toString().padStart(exponent, '0')}`;
}

export function formatRiyadhDate(value: Date): string {
  return riyadhParts(value, false);
}

export function formatRiyadhDateTime(value: Date): string {
  return riyadhParts(value, true);
}

function riyadhParts(value: Date, withTime: boolean): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: RIYADH,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const date = `${read('day')} ${read('month')} ${read('year')}`;
  if (!withTime) return date;
  return `${date}, ${read('hour')}:${read('minute')}`;
}

export function formatScore(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return MISSING;
  const clamped = Math.min(1, Math.max(0, value));
  const scaled = Math.round(clamped * 10000);
  const whole = Math.floor(scaled / 10000);
  const fraction = (scaled % 10000).toString().padStart(4, '0');
  return `${whole}.${fraction}`;
}

export function reasonLabel(reason: string | null): string {
  if (reason === null || reason.trim() === '') return 'This document is waiting for a decision.';
  return REASON_LABELS[reason] ?? `Recorded reason: ${reason}.`;
}

export function flagLabel(flag: string): string {
  return FLAG_LABELS[flag] ?? flag;
}

export function signalLabel(name: SignalName): string {
  return SIGNAL_LABELS[name];
}

export function readSignals(value: unknown): StoredSignals {
  const signals: StoredSignals['signals'] = {};
  if (typeof value !== 'object' || value === null) return { signals, flags: [] };
  const record = value as Record<string, unknown>;
  const raw = record.signals;
  if (typeof raw === 'object' && raw !== null) {
    const scores = raw as Record<string, unknown>;
    for (const name of Object.keys(SIGNAL_LABELS) as SignalName[]) {
      const score = scores[name];
      if (typeof score === 'number' && Number.isFinite(score)) signals[name] = score;
    }
  }
  const flags = Array.isArray(record.flags)
    ? record.flags.filter((flag): flag is string => typeof flag === 'string')
    : [];
  return { signals, flags };
}

export function candidateActions(
  status: string,
  alreadyConfirmed: boolean,
): { canConfirm: boolean; canReject: boolean; blockedReason: string | null } {
  if (status !== 'CANDIDATE') {
    return { canConfirm: false, canReject: false, blockedReason: null };
  }
  if (alreadyConfirmed) {
    return {
      canConfirm: false,
      canReject: true,
      blockedReason: 'This transaction already has a confirmed document.',
    };
  }
  return { canConfirm: true, canReject: true, blockedReason: null };
}

export function decisionMessage(result: {
  status: DecisionStatus;
  documentStatus?: DocumentStatus;
}): ReviewNotice {
  switch (result.status) {
    case 'CONFIRMED':
      return { tone: 'success', text: 'Confirmed. This receipt is now attached to that transaction.' };
    case 'REJECTED':
      return result.documentStatus === 'UNMATCHED'
        ? { tone: 'success', text: 'Rejected. No candidates remain, so this document is unmatched.' }
        : { tone: 'success', text: 'Rejected. Other candidates are still waiting for a decision.' };
    case 'ALREADY_CONFIRMED':
      return { tone: 'warning', text: 'This match was already confirmed. Refresh the queue to see the saved state.' };
    case 'ALREADY_REJECTED':
      return { tone: 'warning', text: 'This match was already rejected. Refresh the queue to see the saved state.' };
    case 'CONFLICT':
      return {
        tone: 'warning',
        text: 'That decision was not saved. The document or transaction changed. Refresh the queue and review the current candidates.',
      };
    case 'NOT_FOUND':
      return { tone: 'warning', text: 'That match no longer exists. Refresh the queue to see the saved state.' };
  }
}

export function outcomeFromAction(
  result:
    | {
        data?: { status: DecisionStatus; documentStatus?: DocumentStatus };
        serverError?: string;
        validationErrors?: unknown;
      }
    | undefined,
): ReviewNotice {
  if (
    result === undefined ||
    result.serverError !== undefined ||
    result.validationErrors !== undefined ||
    result.data === undefined
  ) {
    return { tone: 'error', text: 'The decision could not be saved. Nothing was changed.' };
  }
  return decisionMessage(result.data);
}
