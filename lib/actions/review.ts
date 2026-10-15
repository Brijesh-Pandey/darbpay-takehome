'use server';

import { revalidatePath } from 'next/cache';
import { actionClient } from '@/lib/actions/safe-action-client';
import { matchIdSchema } from '@/lib/actions/review-schema';
import { getPrisma } from '@/lib/prisma';
import { confirmMatchDecision, rejectMatchDecision } from '@/lib/services/review-decisions';

export const confirmMatch = actionClient.inputSchema(matchIdSchema).action(async ({ parsedInput }) => {
  const result = await confirmMatchDecision(getPrisma(), parsedInput.matchId);
  revalidatePath('/review');
  return result;
});

export const rejectMatch = actionClient.inputSchema(matchIdSchema).action(async ({ parsedInput }) => {
  const result = await rejectMatchDecision(getPrisma(), parsedInput.matchId);
  revalidatePath('/review');
  return result;
});
