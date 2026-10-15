import { loadFixtureCatalog, type LoadedFixture } from '@/lib/extraction/fixtures';
import { sha256Hex } from '@/lib/extraction/hash';
import { parseExtractedDocument } from '@/lib/extraction/schema';
import { ExtractionError, UNKNOWN_EXTRACTION, type DocumentExtractor, type ExtractedDocument } from '@/lib/extraction/types';

/** Deterministic extractor. The SHA-256 of the bytes selects the fixture. The MIME type is not a lookup key. */
export class MockExtractor implements DocumentExtractor {
  private readonly byHash: ReadonlyMap<string, LoadedFixture>;

  constructor(catalog: readonly LoadedFixture[] = loadFixtureCatalog()) {
    const byHash = new Map<string, LoadedFixture>();
    for (const fixture of catalog) {
      if (byHash.has(fixture.sha256)) throw new Error(`Two fixtures share SHA-256 ${fixture.sha256}`);
      byHash.set(fixture.sha256, fixture);
    }
    this.byHash = byHash;
  }

  async extract(file: Buffer, mimeType: string): Promise<ExtractedDocument> {
    if (!Buffer.isBuffer(file)) {
      throw new ExtractionError('INVALID_INPUT', 'extract expects a Buffer of file bytes');
    }
    if (typeof mimeType !== 'string') {
      throw new ExtractionError('INVALID_INPUT', 'extract expects a MIME type string');
    }
    const fixture = this.byHash.get(sha256Hex(file));
    if (fixture === undefined) return structuredClone(UNKNOWN_EXTRACTION);
    if (fixture.kind === 'error') {
      throw new ExtractionError('UNREADABLE', `Fixture ${fixture.name} is marked unreadable`);
    }
    return parseExtractedDocument(fixture.result);
  }
}
