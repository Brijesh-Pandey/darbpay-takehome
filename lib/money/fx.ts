import { canonicalCurrency, minorUnitExponent } from '@/lib/money/currencies';

/**
 * Official units of this currency for 1 US dollar.
 * These are pegs, not market rates. EUR, GBP, and JPY are absent on purpose:
 * a guessed rate must not rank a receipt against a charge.
 * 1 USD = numerator / denominator major units.
 */
const USD_PEGS: Readonly<Record<string, { numerator: number; denominator: number }>> = {
  USD: { numerator: 1, denominator: 1 },
  SAR: { numerator: 15, denominator: 4 },
  AED: { numerator: 1469, denominator: 400 },
  BHD: { numerator: 47, denominator: 125 },
  OMR: { numerator: 769, denominator: 2000 },
  QAR: { numerator: 91, denominator: 25 },
  JOD: { numerator: 709, denominator: 1000 },
  PAB: { numerator: 1, denominator: 1 },
  BMD: { numerator: 1, denominator: 1 },
  BSD: { numerator: 1, denominator: 1 },
};

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);

function pow10(exponent: number): bigint {
  let value = ONE;
  for (let step = 0; step < exponent; step += 1) value *= TEN;
  return value;
}

/**
 * Converts an integer amount from one currency's minor units into another's.
 * Returns null when either code is unknown or the pair has no peg.
 * The stored amounts are not changed. Callers use this only to score.
 */
export function convertMinorUnits(amount: number, from: string, to: string): number | null {
  const source = canonicalCurrency(from);
  const target = canonicalCurrency(to);
  if (source === null || target === null) return null;
  if (!Number.isInteger(amount) || amount <= 0) return null;
  if (source === target) return amount;

  const sourcePeg = USD_PEGS[source];
  const targetPeg = USD_PEGS[target];
  const sourceExponent = minorUnitExponent(source);
  const targetExponent = minorUnitExponent(target);
  if (sourcePeg === undefined || targetPeg === undefined || sourceExponent === null || targetExponent === null) {
    return null;
  }

  const numerator =
    BigInt(amount) * BigInt(sourcePeg.denominator) * BigInt(targetPeg.numerator) * pow10(targetExponent);
  const denominator = BigInt(sourcePeg.numerator) * BigInt(targetPeg.denominator) * pow10(sourceExponent);
  if (denominator === ZERO) return null;
  const converted = (numerator + denominator / TWO) / denominator;
  if (converted <= ZERO || converted > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(converted);
}
