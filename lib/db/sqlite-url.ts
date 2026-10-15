import path from 'node:path';

/**
 * Prisma CLI resolves `file:./dev.db` from `prisma/schema.prisma`.
 * The bundled client does not. A relative file URL is resolved against `prisma/`
 * so migrations and the app open the same database.
 */
export function resolveSqliteUrl(databaseUrl: string | undefined, cwd = process.cwd()): string | undefined {
  if (databaseUrl === undefined || !databaseUrl.startsWith('file:')) return databaseUrl;
  const rest = databaseUrl.slice('file:'.length);
  const queryAt = rest.indexOf('?');
  const filePart = queryAt === -1 ? rest : rest.slice(0, queryAt);
  const query = queryAt === -1 ? '' : rest.slice(queryAt);
  if (filePart.length === 0) return databaseUrl;
  if (path.isAbsolute(filePart)) return `file:${filePart}${query}`;
  return `file:${path.resolve(cwd, 'prisma', filePart)}${query}`;
}
