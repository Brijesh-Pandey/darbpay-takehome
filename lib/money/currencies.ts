/**
 * ISO 4217 currencies this product will store and display.
 * The exponent is the number of minor units in one major unit.
 * SAR halalas, USD cents, and KWD fils are all integers of that size.
 * A blank code means SAR. An unknown code is not a currency.
 */

const EXPONENT_0 = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

const EXPONENT_3 = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

const EXPONENT_4 = new Set(['CLF', 'UYW']);

const KNOWN = new Set([
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
  'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD',
  'CAD', 'CDF', 'CHF', 'CLF', 'CLP', 'CNY', 'COP', 'CRC', 'CUP', 'CVE', 'CZK',
  'DJF', 'DKK', 'DOP', 'DZD',
  'EGP', 'ERN', 'ETB', 'EUR',
  'FJD', 'FKP',
  'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD',
  'HKD', 'HNL', 'HTG', 'HUF',
  'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK',
  'JMD', 'JOD', 'JPY',
  'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT',
  'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD',
  'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN',
  'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD',
  'OMR',
  'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG',
  'QAR',
  'RON', 'RSD', 'RUB', 'RWF',
  'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL',
  'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS',
  'UAH', 'UGX', 'USD', 'UYU', 'UYW', 'UZS',
  'VES', 'VND', 'VUV',
  'WST',
  'XAF', 'XCD', 'XOF', 'XPF',
  'YER',
  'ZAR', 'ZMW', 'ZWG',
]);

export const DEFAULT_CURRENCY = 'SAR';

export function canonicalCurrency(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const code = value.trim().toUpperCase();
  if (code === '') return null;
  return KNOWN.has(code) ? code : null;
}

export function isKnownCurrency(value: string): boolean {
  return canonicalCurrency(value) !== null;
}

/** Minor digits in one major unit, or null when the code is not a known currency. */
export function minorUnitExponent(value: string | null | undefined): number | null {
  const code = canonicalCurrency(value);
  if (code === null) return null;
  if (EXPONENT_0.has(code)) return 0;
  if (EXPONENT_3.has(code)) return 3;
  if (EXPONENT_4.has(code)) return 4;
  return 2;
}
