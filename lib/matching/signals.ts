import type { MatchConfig } from '@/lib/matching/config';
import { merchantSimilarity } from '@/lib/matching/similarity';

const DAY_MS = 86_400_000;
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

export function scoreAmount(
  documentAmount: number,
  transactionAmount: number,
  config: MatchConfig,
): { score: number; tip: boolean } | null {
  const difference = transactionAmount - documentAmount;
  if (difference === 0) return { score: 1, tip: false };
  const band = Math.max(config.roundingHalalas, config.roundingRatio * documentAmount);
  if (Math.abs(difference) <= band) return { score: 0.9, tip: false };
  if (difference > 0 && difference <= documentAmount * config.tipRatio) return { score: 0.5, tip: true };
  return null;
}

export function scoreMerchant(documentName: string | null, transactionName: string, minimum: number): number | null {
  if (documentName === null || documentName.trim() === '') return null;
  const score = merchantSimilarity(documentName, transactionName);
  if (score === null) return null;
  if (score < minimum) return null;
  return score;
}

export function scoreCard(documentCard: string | null, transactionCard: string | null): number | null {
  const left = last4(documentCard);
  const right = last4(transactionCard);
  if (left === null || right === null) return null;
  return left === right ? 1 : 0;
}

export function scoreDate(documentDate: string | null, transactionAt: Date, config: MatchConfig): number | null {
  if (documentDate === null || documentDate.trim() === '') return null;
  const documentDay = calendarDay(documentDate.trim());
  const transactionDay = riyadhDay(transactionAt);
  if (documentDay === null || transactionDay === null) return null;
  const gap = Math.abs(documentDay - transactionDay);
  if (gap === 0) return 1;
  if (gap >= config.dateZeroFromDays) return 0;
  return 1 - gap / config.dateDivisor;
}

function last4(value: string | null): string | null {
  if (value === null) return null;
  const digits = value.replace(/\D/g, '');
  if (digits === '') return null;
  return digits.length > 4 ? digits.slice(-4) : digits;
}

function calendarDay(value: string): number | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly !== null) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    return utcDay(year, month, day);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((parsed + RIYADH_OFFSET_MS) / DAY_MS);
}

function riyadhDay(value: Date): number | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return Math.floor((value.getTime() + RIYADH_OFFSET_MS) / DAY_MS);
}

function utcDay(year: number, month: number, day: number): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return Math.floor(utc / DAY_MS);
}
