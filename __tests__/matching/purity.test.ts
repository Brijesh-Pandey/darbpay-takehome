import fs from 'node:fs';
import path from 'node:path';

const matcherFiles = [
  'lib/matching/config.ts',
  'lib/matching/types.ts',
  'lib/matching/normalize.ts',
  'lib/matching/similarity.ts',
  'lib/matching/signals.ts',
  'lib/matching/round.ts',
  'lib/services/transaction-matcher.ts',
];

describe('matcher purity', () => {
  it('does not import Prisma, the filesystem, or a path module, and does not call the clock or random', () => {
    for (const file of matcherFiles) {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(/from ['"]@prisma\/client['"]/);
      expect(source).not.toMatch(/from ['"]node:(fs|path)['"]/);
      expect(source).not.toMatch(/from ['"](fs|path)['"]/);
      expect(source).not.toContain('Date.now');
      expect(source).not.toContain('Math.random');
    }
  });
});
