import { PrismaClient } from '@prisma/client';
import { resolveSqliteUrl } from '@/lib/db/sqlite-url';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma === undefined) {
    globalForPrisma.prisma = new PrismaClient({
      datasourceUrl: resolveSqliteUrl(process.env.DATABASE_URL),
    });
  }
  return globalForPrisma.prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (globalForPrisma.prisma === undefined) return;
  await globalForPrisma.prisma.$disconnect();
  globalForPrisma.prisma = undefined;
}
