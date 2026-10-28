import { canonicalCurrency, minorUnitExponent } from '@/lib/money/currencies';
import { UNKNOWN_EXTRACTION, type ExtractedDocument } from '@/lib/extraction/types';

/**
 * Turns OCR or PDF text into the extraction contract.
 * Amounts stay in the currency's own minor units. A missing currency is left null;
 * the matcher treats that as SAR. An unlabeled number is read with two decimal places.
 * A numeric date with both parts at or below 12 is day/month/year.
 * A VAT total, tax total, subtotal, or tender line is not the payable amount.
 */

const AMBIGUOUS_CODES = new Set(['ALL', 'MAD', 'SOS', 'TRY']);
const ONE = BigInt(1);

const PAYABLE_STRONG =
  /\b(grand\s+total|amount\s+due|balance\s+due|total\s+due)\b|الاجمالي|الإجمالي/i;
const PAYABLE = /\b(total\s+amount|total|amount|amt)\b|المجموع/i;
const TAX_TOTAL =
  /\b(sub[\s-]*total|vatable|vat\.?\s*total|total\s+vat|excluding\s+vat|change|tender)\b/i;
const TAX_OR_TENDER = /\b(vat|tax|gst|change|tender|cash)\b/i;
const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function parseReceiptText(rawText: string, extractionConfidence: number): ExtractedDocument {
  const confidence = clampConfidence(extractionConfidence);
  const cleaned = repairSpacedMoney(rawText.replace(/\u0000/g, ' '));
  if (cleaned.trim() === '') {
    return { ...UNKNOWN_EXTRACTION, rawText, extractionConfidence: 0 };
  }

  const lines = linesOf(cleaned);
  const totalLine = pickTotalLine(lines);
  const currency = currencyFor(totalLine, cleaned);
  const exponent = minorUnitExponent(currency) ?? 2;
  const totalAmount = totalLine === null ? null : lastAmount(totalLine, exponent);
  const documentType = documentKind(cleaned, totalAmount !== null);
  const merchantName = findMerchant(lines) ?? merchantFallback(rawText);

  return {
    documentType,
    merchantName,
    vatNumber: findVat(cleaned),
    totalAmount,
    currency,
    documentDate: findDate(cleaned),
    cardLast4: findCard(cleaned),
    invoiceNumber: findInvoice(lines, cleaned),
    rawText: cleaned.slice(0, 50_000),
    extractionConfidence: confidence,
  };
}

function documentKind(text: string, hasAmount: boolean): ExtractedDocument['documentType'] {
  if (/\b(tax\s+invoice|vat\s+invoice)\b|فاتورة\s*ضريبية/i.test(text)) return 'TAX_INVOICE';
  if (/\bsimplified\b/i.test(text) && /\binvoice\b/i.test(text)) return 'TAX_INVOICE';
  if (hasAmount || /\b(receipt|invoice|total)\b/i.test(text)) return 'RECEIPT';
  return 'UNKNOWN';
}

function pickTotalLine(lines: readonly string[]): string | null {
  let best: { line: string; rank: number } | null = null;
  for (const line of lines) {
    const rank = payableRank(line);
    if (rank === 0) continue;
    if (best === null || rank >= best.rank) best = { line, rank };
  }
  return best === null ? null : best.line;
}

function payableRank(line: string): number {
  if (/\bvatable\b/i.test(line)) return 1;
  if (TAX_TOTAL.test(line)) return 0;
  if (/\bcash\b/i.test(line) && !PAYABLE_STRONG.test(line) && !/\btotal\b/i.test(line)) return 0;
  if (PAYABLE_STRONG.test(line)) return 3;
  if (PAYABLE.test(line)) return 2;
  return 0;
}

function isTotalLine(line: string): boolean {
  return payableRank(line) > 0;
}

function lastAmount(line: string, exponent: number): number | null {
  const tokens = amountTokens(maskDates(maskCard(maskVat(line))));
  const token = tokens[tokens.length - 1];
  if (token === undefined) return null;
  return toMinorUnits(token, exponent);
}

function amountTokens(line: string): string[] {
  const tokens: string[] = [];
  const pattern = /(?<!\d)(\d{1,3}(?:[.,]\d{3})+|\d+)([.,]\d{1,4})?(?!\d)/g;
  for (const match of line.matchAll(pattern)) {
    const token = `${match[1] ?? ''}${match[2] ?? ''}`;
    const digits = token.replace(/\D/g, '');
    if (digits.length === 0 || digits.length > 9) continue;
    tokens.push(token);
  }
  return tokens;
}

function toMinorUnits(token: string, exponent: number): number | null {
  const parts = splitMajor(token, exponent);
  if (parts === null) return null;
  return minorFromParts(parts.whole, parts.frac, exponent);
}

function splitMajor(token: string, exponent: number): { whole: string; frac: string } | null {
  const dot = token.lastIndexOf('.');
  const comma = token.lastIndexOf(',');
  let decimalAt = -1;
  if (dot >= 0 && comma >= 0) {
    decimalAt = Math.max(dot, comma);
  } else if (dot >= 0 || comma >= 0) {
    const sep = dot >= 0 ? dot : comma;
    const groups = token.split(/[.,]/);
    const lastLen = groups[groups.length - 1]?.length ?? 0;
    const grouped = groups.slice(1).every((group) => group.length === 3);
    const threeDecimalCurrency = exponent === 3 && groups.length === 2 && lastLen === 3;
    const thousands =
      grouped && !threeDecimalCurrency && (groups.length > 2 || (comma >= 0 && dot < 0 && lastLen === 3));
    decimalAt = thousands ? -1 : sep;
  }
  const wholeRaw = (decimalAt === -1 ? token : token.slice(0, decimalAt)).replace(/[.,]/g, '');
  const frac = decimalAt === -1 ? '' : token.slice(decimalAt + 1).replace(/[.,]/g, '');
  if (!/^\d+$/.test(wholeRaw) || (frac !== '' && !/^\d+$/.test(frac))) return null;
  return { whole: wholeRaw.replace(/^0+(?=\d)/, ''), frac };
}

function minorFromParts(whole: string, frac: string, exponent: number): number | null {
  let major = whole === '' ? '0' : whole;
  let digits = frac;
  if (digits.length > exponent) {
    const extra = digits.slice(exponent);
    digits = digits.slice(0, exponent);
    if ((extra[0] ?? '0') >= '5') {
      const combined = `${major}${digits}`.replace(/^0+(?=\d)/, '') || '0';
      const bumped = (BigInt(combined) + ONE).toString().padStart(Math.max(exponent, 1), '0');
      if (exponent === 0) {
        major = bumped;
        digits = '';
      } else {
        major = bumped.slice(0, bumped.length - exponent);
        digits = bumped.slice(bumped.length - exponent);
      }
    }
  } else {
    digits = digits.padEnd(exponent, '0');
  }
  const minorText = `${major}${digits}`.replace(/^0+(?=\d)/, '');
  if (!/^\d+$/.test(minorText)) return null;
  const value = Number(minorText);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function currencyFor(totalLine: string | null, document: string): string | null {
  if (totalLine === null) return null;
  const onLine = unique(codesIn(totalLine));
  if (onLine.length >= 1) return onLine[onLine.length - 1] ?? null;
  const symbol = symbolCurrency(totalLine);
  if (symbol !== null) return symbol;
  const inDocument = unique(codesIn(document));
  if (inDocument.length === 1) return inDocument[0] ?? null;
  return symbolCurrency(document);
}

function codesIn(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\b([A-Za-z]{3})\b/g)) {
    const raw = match[1];
    if (raw === undefined) continue;
    const code = canonicalCurrency(raw);
    if (code === null) continue;
    const index = match.index ?? 0;
    const besideDigit = /\d/.test(text.slice(Math.max(0, index - 1), index + raw.length + 1));
    const upper = raw === raw.toUpperCase();
    if (!upper && !besideDigit) continue;
    if (AMBIGUOUS_CODES.has(code) && !besideDigit) continue;
    found.push(code);
  }
  return found;
}

function symbolCurrency(text: string): string | null {
  if (text.includes('€')) return 'EUR';
  if (text.includes('£')) return 'GBP';
  if (text.includes('¥')) return 'JPY';
  if (text.includes('﷼') || text.includes('ر.س') || text.includes('ريال')) return 'SAR';
  if (text.includes('$')) return 'USD';
  return null;
}

function unique(codes: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const code of codes) {
    if (seen.has(code)) continue;
    seen.add(code);
    result.push(code);
  }
  return result;
}

function findCard(text: string): string | null {
  const labeled = text.match(
    /\b(?:visa|mastercard|master\s*card|mada|amex|american\s*express|card|ending(?:\s+in)?)\b\D{0,20}(\d{4})(?!\d)/i,
  );
  if (labeled?.[1] !== undefined) return labeled[1];
  const masked = text.match(/[*xX]{2,}[\s-]*(\d{4})(?!\d)/);
  if (masked?.[1] !== undefined) return masked[1];
  const pan = text.match(/\b(?:\d{4}[\s-]){3}(\d{4})\b/);
  return pan?.[1] ?? null;
}

function findVat(text: string): string | null {
  const labeled = text.match(/\b(?:vat|trn|tax\s*(?:id|number|no\.?))\b[\s\S]{0,40}?(\d{15})(?!\d)/i);
  if (labeled?.[1] !== undefined) return labeled[1];
  const wrapped = wrappedVat(text);
  if (wrapped !== null) return wrapped;
  const any = text.match(/(?<!\d)(\d{15})(?!\d)/);
  return any?.[1] ?? null;
}

/** A 15-digit VAT printed as a long run and a short tail on the next line. A short run is not completed. */
function wrappedVat(text: string): string | null {
  const labeled = text.match(/\b(?:vat|trn|tax\s*(?:id|number|no\.?))\b[\s\S]{0,40}?(\d{10,14})(?!\d)/i);
  if (labeled?.[1] === undefined || labeled.index === undefined) return null;
  const digits = labeled[1];
  const after = text.slice(labeled.index + labeled[0].length);
  const nextLine = after
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const tail = nextLine?.match(/^(\d{1,5})$/)?.[1];
  if (tail === undefined || digits.length + tail.length !== 15) return null;
  return digits + tail;
}

function findInvoice(lines: readonly string[], text: string): string | null {
  for (const [index, line] of lines.entries()) {
    if (!/\binv|\breceipt\b/i.test(line)) continue;
    const onLine = invoiceToken(line);
    if (onLine !== null) return onLine;
    const following = lines[index + 1];
    if (following === undefined) continue;
    const next = invoiceToken(following) ?? standaloneReference(following);
    if (next !== null) return next;
  }
  return invoiceToken(text);
}

function invoiceToken(text: string): string | null {
  const prefixed = text.match(/\b(INV[/-][A-Z0-9][A-Z0-9/-]{1,40})/i);
  if (prefixed?.[1] !== undefined && isReference(prefixed[1])) return prefixed[1].toUpperCase();
  const pattern = /\b(?:invoice|inv|receipt)\b\.?\s*(?:no\.?|number|id|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{1,40})/gi;
  for (const match of text.matchAll(pattern)) {
    const token = (match[1] ?? '').replace(/[/-]+$/, '');
    if (!isReference(token)) continue;
    return token.toUpperCase();
  }
  if (text.includes('\n') || !/\binv|\breceipt\b/i.test(text)) return null;
  const digits = [...text.matchAll(/(?<!\d)(\d{4,12})(?!\d)/g)];
  const last = digits[digits.length - 1]?.[1];
  if (last === undefined || !isReference(last)) return null;
  return last;
}

function standaloneReference(line: string): string | null {
  const token = line.trim().match(/^(INV[/-][A-Z0-9][A-Z0-9/-]{1,40}|\d{4,12})$/i)?.[1];
  if (token === undefined || !isReference(token)) return null;
  return token.toUpperCase();
}

function isReference(token: string): boolean {
  if (token.length < 2 || !/\d/.test(token)) return false;
  return !/^(tax|invoice|receipt|total|date|card|id|number)$/i.test(token);
}

function findDate(text: string): string | null {
  const labeled = linesOf(text).filter((line) => /\b(date|dated|issued)\b/i.test(line));
  return firstDate(labeled.join('\n')) ?? firstDate(text);
}

function firstDate(text: string): string | null {
  for (const match of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    const iso = isoDay(Number(match[1]), Number(match[2]), Number(match[3]));
    if (iso !== null) return iso;
  }
  for (const match of text.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})\b/g)) {
    const month = MONTHS[(match[2] ?? '').toLowerCase()];
    if (month === undefined) continue;
    const iso = isoDay(Number(match[3]), month, Number(match[1]));
    if (iso !== null) return iso;
  }
  for (const match of text.matchAll(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(20\d{2})\b/g)) {
    const month = MONTHS[(match[1] ?? '').toLowerCase()];
    if (month === undefined) continue;
    const iso = isoDay(Number(match[3]), month, Number(match[2]));
    if (iso !== null) return iso;
  }
  for (const match of text.matchAll(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/g)) {
    const iso = numericDay(Number(match[1]), Number(match[2]), Number(match[3]));
    if (iso !== null) return iso;
  }
  for (const match of text.matchAll(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2})\b/g)) {
    const iso = numericDay(Number(match[1]), Number(match[2]), 2000 + Number(match[3]));
    if (iso !== null) return iso;
  }
  return null;
}

/** A faint decimal on a thermal slip is often a space: "800 00" is 800.00. */
function repairSpacedMoney(text: string): string {
  return text.replace(/(?<!\d)(\d{1,6}) (\d{2})(?!\d)/g, '$1.$2');
}

function numericDay(first: number, second: number, year: number): string | null {
  if (first > 12 && second <= 12) return isoDay(year, second, first);
  if (second > 12 && first <= 12) return isoDay(year, first, second);
  if (first <= 12 && second <= 12) return isoDay(year, second, first);
  return null;
}

function isoDay(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function findMerchant(lines: readonly string[]): string | null {
  for (const line of lines) {
    if (line.length < 2) continue;
    if (/page\s+\d+\s+of\s+\d+/i.test(line)) continue;
    if (/^(tax\s+invoice|vat\s+invoice|invoice|receipt|original|customer\s+copy|merchant\s+copy)$/i.test(line)) {
      continue;
    }
    if (isTotalLine(line) || TAX_OR_TENDER.test(line) || /\b(card|visa|mastercard|mada|tel|phone)\b/i.test(line)) {
      continue;
    }
    if (firstDate(line) !== null && line.length < 40) continue;
    const letters = line.replace(/[^A-Za-z\u0600-\u06FF]/g, '');
    if (letters.length < 2) continue;
    return line.slice(0, 120);
  }
  return null;
}

function merchantFallback(text: string): string | null {
  const stripped = text
    .replace(/\b(tax\s+invoice|vat\s+invoice|invoice|receipt)\b/gi, ' ')
    .replace(/\binv[-a-z0-9]+\b/gi, ' ')
    .replace(/\b(?:vat|trn)\b\s*\d{15}/gi, ' ')
    .replace(/\b(?:grand\s+total|sub[\s-]*total|total|card|visa|mastercard)\b[^A-Za-z]*/gi, ' ')
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ')
    .replace(/[$€£¥﷼]/g, ' ')
    .replace(/\d+[.,]\d+/g, ' ')
    .replace(/\b[A-Z]{3}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const letters = stripped.replace(/[^A-Za-z\u0600-\u06FF ]/g, '').trim();
  if (letters.replace(/[^A-Za-z\u0600-\u06FF]/g, '').length < 2) return null;
  return letters.slice(0, 120);
}

function maskDates(line: string): string {
  return line
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]20\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+20\d{2}\b/gi, ' ')
    .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+20\d{2}\b/gi, ' ');
}

function maskCard(line: string): string {
  return line
    .replace(/(?:\d{4}[\s-]){3}\d{4}/g, ' ')
    .replace(/[*xX]{2,}[\s-]*\d{4}/g, ' ')
    .replace(/\b(?:visa|mastercard|mada|amex|card|ending)(?:\s+in)?\D{0,12}\d{4}\b/gi, ' ');
}

function maskVat(line: string): string {
  return line.replace(/(?<!\d)\d{15}(?!\d)/g, ' ');
}

function linesOf(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.min(1, Math.max(0, value)).toFixed(4));
}
