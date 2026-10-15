import { z } from 'zod';

export const MAX_TRANSACTIONS = 20;
export const MAX_TRANSACTIONS_BODY_CHARS = 1024 * 1024;

const chargeSchema = z.object({
  externalRef: z.string().trim().min(1).max(200),
  clientId: z.number().int().positive(),
  cardLast4: z.string().regex(/^\d{4}$/),
  driverPhone: z.string().trim().min(1).max(40).nullable().optional(),
  merchantName: z.string().trim().min(1).max(200),
  amount: z.number().int().positive(),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .transform((code) => code.toUpperCase())
    .optional(),
  transactionAt: z.string().datetime(),
});

export const transactionsPayloadSchema = z
  .object({
    transactions: z.array(chargeSchema).min(1).max(MAX_TRANSACTIONS),
  })
  .strict();

export type TransactionsPayload = z.infer<typeof transactionsPayloadSchema>;
export type ChargeInput = TransactionsPayload['transactions'][number];
