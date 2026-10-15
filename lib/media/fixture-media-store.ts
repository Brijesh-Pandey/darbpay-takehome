import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { MediaMapError, MediaNotFoundError, type MediaFile, type MediaStore } from '@/lib/media/types';

const mediaEntrySchema = z
  .object({
    file: z.string().min(1),
    mimeType: z.string().trim().min(1),
  })
  .strict();

const mediaMapSchema = z.record(z.string().min(1), mediaEntrySchema);

type MediaEntry = {
  absolutePath: string;
  mimeType: string;
};

const DEFAULT_MAP = path.resolve(process.cwd(), 'fixtures/media-map.json');

/**
 * Resolves a WhatsApp media id through a map. The id is a lookup key, never a path.
 * The MIME type is the value in the map. The file extension is not consulted.
 */
export class FixtureMediaStore implements MediaStore {
  private readonly entries: ReadonlyMap<string, MediaEntry>;

  constructor(mapPath = DEFAULT_MAP) {
    const root = path.dirname(mapPath);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(mapPath, 'utf8'));
    } catch {
      throw new MediaMapError('media-map.json is missing or is not valid JSON');
    }
    const map = mediaMapSchema.safeParse(parsed);
    if (!map.success) throw new MediaMapError('media-map.json must map a media id to a file and a MIME type');

    const entries = new Map<string, MediaEntry>();
    for (const [mediaId, entry] of Object.entries(map.data)) {
      entries.set(mediaId, {
        absolutePath: resolveInside(root, entry.file),
        mimeType: entry.mimeType,
      });
    }
    this.entries = entries;
  }

  async get(mediaId: string): Promise<MediaFile> {
    const entry = this.entries.get(mediaId);
    if (entry === undefined) throw new MediaNotFoundError();
    try {
      const bytes = await readFile(entry.absolutePath);
      return { bytes, mimeType: entry.mimeType };
    } catch {
      throw new MediaNotFoundError('Mapped media file is missing');
    }
  }
}

function resolveInside(root: string, relativePath: string): string {
  if (relativePath.includes('\0') || path.isAbsolute(relativePath)) {
    throw new MediaMapError('Media path must stay inside fixtures');
  }
  const resolved = path.resolve(root, relativePath);
  const fromRoot = path.relative(root, resolved);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) {
    throw new MediaMapError('Media path must stay inside fixtures');
  }
  return resolved;
}
