import fs from 'node:fs';
import path from 'node:path';
import { FixtureMediaStore } from '@/lib/media/fixture-media-store';
import { MediaMapError, MediaNotFoundError } from '@/lib/media/types';

const root = path.resolve(process.cwd(), '.test-db/media-store');

describe('FixtureMediaStore', () => {
  const store = new FixtureMediaStore();

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns the mapped bytes and the declared MIME type, not the file extension', async () => {
    const media = await store.get('media_4471');
    const file = fs.readFileSync(path.join(process.cwd(), 'fixtures/documents/exact-alfanar.txt'));
    expect(media.bytes.equals(file)).toBe(true);
    expect(media.mimeType).toBe('image/jpeg');
    expect(path.extname('fixtures/documents/exact-alfanar.txt')).toBe('.txt');
  });

  it('returns the invoice bytes declared as a PDF', async () => {
    const media = await store.get('media_missing_charge');
    expect(media.mimeType).toBe('application/pdf');
    expect(media.bytes.toString('utf8')).toContain('missing-charge');
  });

  it('throws MediaNotFoundError for an unknown id and does not treat the id as a path', async () => {
    await expect(store.get('media_missing')).rejects.toBeInstanceOf(MediaNotFoundError);
    await expect(store.get('../package.json')).rejects.toBeInstanceOf(MediaNotFoundError);
    await expect(store.get('documents/exact-alfanar.txt')).rejects.toBeInstanceOf(MediaNotFoundError);
  });

  it('rejects a map entry that resolves outside the fixtures directory', () => {
    fs.mkdirSync(root, { recursive: true });
    const mapPath = path.join(root, 'media-map.json');
    fs.writeFileSync(mapPath, JSON.stringify({ media_1: { file: '../package.json', mimeType: 'text/plain' } }));
    expect(() => new FixtureMediaStore(mapPath)).toThrow(MediaMapError);
    fs.writeFileSync(mapPath, JSON.stringify({ media_1: { file: '/etc/passwd', mimeType: 'text/plain' } }));
    expect(() => new FixtureMediaStore(mapPath)).toThrow(MediaMapError);
    fs.writeFileSync(mapPath, '{');
    expect(() => new FixtureMediaStore(mapPath)).toThrow(MediaMapError);
  });

  it('throws MediaNotFoundError when the mapped file is absent', async () => {
    fs.mkdirSync(root, { recursive: true });
    const mapPath = path.join(root, 'media-map.json');
    fs.writeFileSync(mapPath, JSON.stringify({ media_1: { file: 'documents/gone.txt', mimeType: 'image/jpeg' } }));
    const missing = new FixtureMediaStore(mapPath);
    await expect(missing.get('media_1')).rejects.toBeInstanceOf(MediaNotFoundError);
  });
});
