import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sha256Hex } from '@/lib/extraction/hash';
import { parseExtractedDocument } from '@/lib/extraction/schema';
import type { ExtractedDocument } from '@/lib/extraction/types';

export const FIXTURE_ROOT = path.resolve(process.cwd(), 'fixtures');

type CatalogRow = {
  name: string;
  file: string;
  extraction?: string;
  throws?: 'UNREADABLE';
};

/** Document bytes live under fixtures/documents. Extraction JSON is separate, so a rename does not change the hash. */
export const FIXTURE_CATALOG: readonly CatalogRow[] = [
  { name: 'exact-alfanar', file: 'documents/exact-alfanar.txt', extraction: 'extractions/exact-alfanar.json' },
  { name: 'albaik-ambiguous', file: 'documents/albaik-ambiguous.txt', extraction: 'extractions/albaik-ambiguous.json' },
  { name: 'chefs-table-tip', file: 'documents/chefs-table-tip.txt', extraction: 'extractions/chefs-table-tip.json' },
  { name: 'missing-charge', file: 'documents/missing-charge.txt', extraction: 'extractions/missing-charge.json' },
  { name: 'unreadable', file: 'documents/unreadable.txt', extraction: 'extractions/unreadable.json' },
  { name: 'unreadable-scan', file: 'documents/unreadable-scan.txt', throws: 'UNREADABLE' },
  { name: 'alfanar-second-photo', file: 'documents/alfanar-second-photo.txt', extraction: 'extractions/exact-alfanar.json' },
  { name: 'low-confidence', file: 'documents/low-confidence.txt', extraction: 'extractions/low-confidence.json' },
  { name: 'missing-date', file: 'documents/missing-date.txt', extraction: 'extractions/missing-date.json' },
  { name: 'missing-card', file: 'documents/missing-card.txt', extraction: 'extractions/missing-card.json' },
  { name: 'missing-merchant', file: 'documents/missing-merchant.txt', extraction: 'extractions/missing-merchant.json' },
  { name: 'unreadable-amount', file: 'documents/unreadable-amount.txt', extraction: 'extractions/unreadable-amount.json' },
];

export type LoadedFixture = {
  name: string;
  bytes: Buffer;
  sha256: string;
} & ({ kind: 'result'; result: ExtractedDocument } | { kind: 'error' });

export function loadFixtureCatalog(root = FIXTURE_ROOT): LoadedFixture[] {
  const loaded: LoadedFixture[] = [];
  const seenNames = new Set<string>();
  const seenHashes = new Set<string>();

  for (const row of FIXTURE_CATALOG) {
    if (seenNames.has(row.name)) throw new Error(`Duplicate fixture name ${row.name}`);
    seenNames.add(row.name);
    const bytes = readFileSync(path.join(root, row.file));
    const sha256 = sha256Hex(bytes);
    if (seenHashes.has(sha256)) throw new Error(`Fixtures share a hash: ${row.name}`);
    seenHashes.add(sha256);
    if (row.throws === 'UNREADABLE') {
      loaded.push({ name: row.name, bytes, sha256, kind: 'error' });
      continue;
    }
    if (row.extraction === undefined) throw new Error(`Fixture ${row.name} has no extraction`);
    const parsed: unknown = JSON.parse(readFileSync(path.join(root, row.extraction), 'utf8'));
    loaded.push({ name: row.name, bytes, sha256, kind: 'result', result: parseExtractedDocument(parsed) });
  }

  return loaded;
}
