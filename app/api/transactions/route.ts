import type { PrismaClient } from '@prisma/client';
import { getPrisma } from '@/lib/prisma';
import { acceptTransactions } from '@/lib/services/rematch';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  return handleTransactionsPost(request);
}

export async function handleTransactionsPost(
  request: Request,
  overrides: { db?: PrismaClient; now?: () => Date } = {},
): Promise<Response> {
  return acceptTransactions(request, {
    db: overrides.db ?? getPrisma(),
    now: overrides.now,
  });
}
