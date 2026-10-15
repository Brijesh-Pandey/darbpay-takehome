import { z } from 'zod';

export const matchIdSchema = z
  .object({
    matchId: z.number().int().positive(),
  })
  .strict();

export type MatchIdInput = z.infer<typeof matchIdSchema>;
