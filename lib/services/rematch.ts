import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { ExtractedFields } from '@/lib/matching/types';
import { log } from '@/lib/logger';
import { applyRematch } from '@/lib/services/match-persistence';
import { normalizePhone } from '@/lib/services/sender-scope';
import { matchDocument } from '@/lib/services/transaction-matcher';
import {
  MAX_TRANSACTIONS_BODY_CHARS,
  transactionsPayloadSchema,
  type ChargeInput,
} from '@/lib/webhooks/transactions-payload';

export type StoredCharge = { transactionId: number; result: 'created' | 'duplicate' };

type StoredRow = StoredCharge & { clientId: number; driverPhone: string | null };

export async function acceptTransactions(
  request: Request,
  deps: { db: PrismaClient; now?: () => Date },
): Promise<Response> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return invalid('INVALID_JSON', [{ path: '', message: 'Request body is not valid JSON' }]);
  }
  if (text.length > MAX_TRANSACTIONS_BODY_CHARS) {
    return invalid('INVALID_PAYLOAD', [{ path: '', message: 'Request body is too large' }]);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return invalid('INVALID_JSON', [{ path: '', message: 'Request body is not valid JSON' }]);
  }
  const payload = transactionsPayloadSchema.safeParse(parsed);
  if (!payload.success) return invalid('INVALID_PAYLOAD', issuesFrom(payload.error));

  const phones = payload.data.transactions.map((charge) => normalizeChargePhone(charge));
  if (phones.some((phone) => phone === 'invalid')) {
    return invalid('INVALID_PAYLOAD', [{ path: 'driverPhone', message: 'Phone number is not valid' }]);
  }

  let stored: StoredRow[];
  try {
    stored = await storeCharges(deps.db, payload.data.transactions, phones);
  } catch (error) {
    if (error instanceof UnknownClientError) {
      return invalid('INVALID_PAYLOAD', [{ path: 'clientId', message: 'Unknown client' }]);
    }
    log.error('transaction store failed', { error: error instanceof Error ? error.name : 'unknown' });
    return Response.json({ error: 'STORE_FAILED' }, { status: 503 });
  }

  try {
    await rematchForCharges(deps.db, stored, deps.now ?? (() => new Date()));
  } catch (error) {
    log.error('transaction rematch failed', { error: error instanceof Error ? error.name : 'unknown' });
    return Response.json({ error: 'STORE_FAILED' }, { status: 503 });
  }

  log.info('transactions accepted', {
    transactions: stored.map((charge) => ({ transactionId: charge.transactionId, result: charge.result })),
  });
  return Response.json({
    transactions: stored.map((charge) => ({ transactionId: charge.transactionId, result: charge.result })),
  });
}

function normalizeChargePhone(charge: ChargeInput): string | null | 'invalid' {
  if (charge.driverPhone == null) return null;
  const phone = normalizePhone(charge.driverPhone);
  return phone === null ? 'invalid' : phone;
}

async function storeCharges(
  db: PrismaClient,
  charges: ChargeInput[],
  phones: Array<string | null | 'invalid'>,
): Promise<StoredRow[]> {
  const clientIds = [...new Set(charges.map((charge) => charge.clientId))];
  const known = await db.client.findMany({ where: { id: { in: clientIds } }, select: { id: true } });
  if (known.length !== clientIds.length) {
    throw new UnknownClientError();
  }

  const stored: StoredRow[] = [];
  for (const [index, charge] of charges.entries()) {
    const driverPhone = phones[index] === 'invalid' ? null : (phones[index] ?? null);
    stored.push(await storeOne(db, charge, driverPhone));
  }
  return stored;
}

class UnknownClientError extends Error {
  constructor() {
    super('unknown client');
    this.name = 'UnknownClientError';
  }
}

async function storeOne(db: PrismaClient, charge: ChargeInput, driverPhone: string | null): Promise<StoredRow> {
  const existing = await db.transaction.findUnique({ where: { externalRef: charge.externalRef } });
  if (existing !== null) {
    return { transactionId: existing.id, result: 'duplicate', clientId: existing.clientId, driverPhone: existing.driverPhone };
  }
  try {
    const created = await db.transaction.create({
      data: {
        externalRef: charge.externalRef,
        clientId: charge.clientId,
        cardLast4: charge.cardLast4,
        driverPhone,
        merchantName: charge.merchantName,
        amount: charge.amount,
        currency: charge.currency ?? 'SAR',
        transactionAt: new Date(charge.transactionAt),
      },
    });
    return { transactionId: created.id, result: 'created', clientId: created.clientId, driverPhone: created.driverPhone };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const raced = await db.transaction.findUnique({ where: { externalRef: charge.externalRef } });
    if (raced === null) throw error;
    return { transactionId: raced.id, result: 'duplicate', clientId: raced.clientId, driverPhone: raced.driverPhone };
  }
}

export async function rematchForCharges(db: PrismaClient, charges: StoredRow[], now: () => Date): Promise<void> {
  const clientIds = [...new Set(charges.map((charge) => charge.clientId))];
  const phones = [...new Set(charges.map((charge) => charge.driverPhone).filter((phone): phone is string => phone !== null))];
  const emails = await emailsForClients(db, clientIds);
  const or = [
    ...(emails.length > 0 ? [{ source: 'EMAIL' as const, senderIdentifier: { in: emails } }] : []),
    ...(phones.length > 0 ? [{ source: 'WHATSAPP' as const, senderIdentifier: { in: phones } }] : []),
  ];
  if (or.length === 0) return;

  const documents = await db.document.findMany({
    where: { status: 'UNMATCHED', OR: or },
    include: { matches: { where: { status: 'REJECTED' }, select: { transactionId: true } } },
  });

  for (const document of documents) {
    const fields = fieldsFromDocument(document);
    if (fields === null) continue;
    const rejected = new Set(document.matches.map((match) => match.transactionId));
    const clientId = document.source === 'EMAIL' ? await clientIdForEmail(db, document.senderIdentifier) : null;
    if (document.source === 'EMAIL' && clientId === null) continue;
    const transactions = await loadEligible(db, document, rejected, clientId);
    const result = matchDocument(
      fields,
      transactions,
      document.source === 'WHATSAPP'
        ? { kind: 'WHATSAPP', driverPhone: document.senderIdentifier }
        : { kind: 'EMAIL', clientId: clientId ?? -1 },
    );
    await applyRematch(db, document.id, result, now());
  }
}

async function emailsForClients(db: PrismaClient, clientIds: number[]): Promise<string[]> {
  if (clientIds.length === 0) return [];
  const senders = await db.clientEmailSender.findMany({
    where: { clientId: { in: clientIds } },
    select: { email: true },
  });
  return senders.map((sender) => sender.email);
}

async function clientIdForEmail(db: PrismaClient, email: string): Promise<number | null> {
  const sender = await db.clientEmailSender.findUnique({ where: { email } });
  return sender === null ? null : sender.clientId;
}

function fieldsFromDocument(document: {
  documentType: string | null;
  merchantName: string | null;
  totalAmount: number | null;
  currency: string | null;
  documentDate: Date | null;
  cardLast4: string | null;
  extractionConfidence: number | null;
}): ExtractedFields | null {
  if (document.documentType !== 'RECEIPT' && document.documentType !== 'TAX_INVOICE') return null;
  if (document.totalAmount === null || !Number.isInteger(document.totalAmount) || document.totalAmount <= 0) return null;
  if (document.extractionConfidence === null) return null;
  return {
    documentType: document.documentType,
    merchantName: document.merchantName,
    totalAmount: document.totalAmount,
    currency: document.currency,
    documentDate: document.documentDate === null ? null : document.documentDate.toISOString(),
    cardLast4: document.cardLast4,
    extractionConfidence: document.extractionConfidence,
  };
}

async function loadEligible(
  db: PrismaClient,
  document: { source: 'EMAIL' | 'WHATSAPP'; senderIdentifier: string },
  rejected: Set<number>,
  clientId: number | null,
) {
  const where =
    document.source === 'WHATSAPP'
      ? { driverPhone: document.senderIdentifier }
      : { clientId: clientId ?? -1 };
  const rows = await db.transaction.findMany({
    where,
    include: {
      documents: {
        where: { status: { in: ['CONFIRMED', 'AUTO_CONFIRMED'] } },
        select: { id: true },
      },
    },
  });
  return rows
    .filter((row) => !rejected.has(row.id))
    .map((row) => ({
      id: row.id,
      clientId: row.clientId,
      driverPhone: row.driverPhone,
      merchantName: row.merchantName,
      amount: row.amount,
      currency: row.currency,
      transactionAt: row.transactionAt,
      cardLast4: row.cardLast4,
      hasConfirmedDocument: row.documents.length > 0,
    }));
}

function issuesFrom(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function invalid(error: 'INVALID_JSON' | 'INVALID_PAYLOAD', issues: Array<{ path: string; message: string }>): Response {
  return Response.json({ error, issues }, { status: 400 });
}

export { UnknownClientError };
