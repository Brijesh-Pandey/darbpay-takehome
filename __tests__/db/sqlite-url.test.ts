import path from 'node:path';
import { resolveSqliteUrl } from '@/lib/db/sqlite-url';

describe('resolveSqliteUrl', () => {
  const cwd = '/work/brijesh';

  it('resolves a relative file URL against prisma/', () => {
    expect(resolveSqliteUrl('file:./dev.db', cwd)).toBe(`file:${path.resolve(cwd, 'prisma/dev.db')}`);
  });

  it('leaves an absolute file URL on that file', () => {
    const absolute = path.resolve(cwd, '.test-db/email-webhook.db');
    expect(resolveSqliteUrl(`file:${absolute}`, cwd)).toBe(`file:${absolute}`);
  });

  it('leaves a non-file URL unchanged', () => {
    expect(resolveSqliteUrl('postgresql://localhost/darb', cwd)).toBe('postgresql://localhost/darb');
    expect(resolveSqliteUrl(undefined, cwd)).toBeUndefined();
  });
});