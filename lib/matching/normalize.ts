const CITY_TOKENS = new Set(['ruh', 'jed', 'dmm', 'riyadh']);
const LEGAL_TOKENS = new Set(['llc', 'co', 'est']);
const GENERIC_TOKENS = new Set(['station', 'retail', 'store', 'shop', 'market']);

export function isGenericToken(token: string): boolean {
  return GENERIC_TOKENS.has(token);
}

export function normalizeMerchant(name: string): string[] {
  const stripped = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const tokens: string[] = [];
  for (const token of stripped.split(' ')) {
    if (token === '' || CITY_TOKENS.has(token) || LEGAL_TOKENS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    tokens.push(token === 'st' ? 'station' : token);
  }
  return tokens;
}
