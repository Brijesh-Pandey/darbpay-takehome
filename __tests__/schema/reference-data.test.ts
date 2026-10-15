import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { seedReferenceData } from '../../prisma/seed';

const databaseFile = path.join(process.cwd(), '.test-db', 'reference-data.db');
const databaseUrl = `file:${databaseFile}`;

let db: PrismaClient;

function migrate(): void {
  execFileSync(path.join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}

beforeAll(async () => {
  fs.rmSync(databaseFile, { force: true });
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
  migrate();
  db = new PrismaClient({ datasourceUrl: databaseUrl });
  await seedReferenceData(db);
}, 60_000);

afterAll(async () => {
  await db.$disconnect();
  fs.rmSync(databaseFile, { force: true });
  fs.rmSync(`${databaseFile}-journal`, { force: true });
});

describe('reference data', () => {
  it('seeds two clients, both mailboxes, and fifteen transactions', async () => {
    expect(await db.client.count()).toBe(2);
    expect(await db.clientEmailSender.count()).toBe(2);
    expect(await db.transaction.count()).toBe(15);
    expect(await db.document.count()).toBe(0);

    const alfanar = await db.clientEmailSender.findUniqueOrThrow({
      where: { email: 'billing@alfanar-fuel.com.sa' },
    });
    expect(alfanar.clientId).toBe(1);

    const other = await db.clientEmailSender.findUniqueOrThrow({
      where: { email: 'billing@redsea-haulage.example' },
    });
    expect(other.clientId).toBe(2);

    const sampleDriver = await db.transaction.findUniqueOrThrow({ where: { id: 1 } });
    expect(sampleDriver.driverPhone).toBe('+966551234567');
    expect(sampleDriver.amount).toBe(12500);
    expect(sampleDriver.currency).toBe('SAR');
  });

  it('includes a same-day same-amount pair and a cross-client twin', async () => {
    const left = await db.transaction.findUniqueOrThrow({ where: { id: 2 } });
    const right = await db.transaction.findUniqueOrThrow({ where: { id: 3 } });
    expect(left.clientId).toBe(1);
    expect(right.clientId).toBe(1);
    expect(left.amount).toBe(right.amount);
    expect(left.driverPhone).toBe(right.driverPhone);
    expect(left.transactionAt.toISOString().slice(0, 10)).toBe(
      right.transactionAt.toISOString().slice(0, 10),
    );
    expect(left.merchantName.startsWith('ALBAIK')).toBe(true);
    expect(right.merchantName.startsWith('ALBAIK')).toBe(true);

    const original = await db.transaction.findUniqueOrThrow({ where: { id: 1 } });
    const twin = await db.transaction.findUniqueOrThrow({ where: { id: 5 } });
    expect(twin.clientId).not.toBe(original.clientId);
    expect(twin.amount).toBe(original.amount);
    expect(twin.merchantName).toBe(original.merchantName);
    expect(twin.cardLast4).toBe(original.cardLast4);
  });

  it('keeps an ingested document when reference data is seeded again', async () => {
    const created = await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'msg_keep#0',
        scope: 'EMAIL:billing@alfanar-fuel.com.sa',
        contentHash: 'abc123',
        senderIdentifier: 'billing@alfanar-fuel.com.sa',
        mimeType: 'application/pdf',
        content: Buffer.from('invoice-bytes'),
      },
    });

    const result = await seedReferenceData(db);

    expect(result.transactions).toBe(15);
    expect(await db.document.count()).toBe(1);
    const kept = await db.document.findUnique({ where: { id: created.id } });
    expect(kept).not.toBeNull();
    if (kept === null) {
      throw new Error('seed deleted the ingested document');
    }
    expect(kept.externalId).toBe('msg_keep#0');
    expect(Buffer.from(kept.content).equals(Buffer.from('invoice-bytes'))).toBe(true);
  });
});

describe('confirmed-match indexes', () => {
  it('creates both partial unique indexes in the initial migration', async () => {
    const rows = await db.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM sqlite_master WHERE type = 'index'
    `;
    const names = rows.map((row) => row.name);
    expect(names).toContain('DocumentMatch_one_confirmed_per_transaction');
    expect(names).toContain('DocumentMatch_one_confirmed_per_document');
  });

  it('allows two candidates for one transaction and rejects a second confirmation', async () => {
    const first = await db.document.create({
      data: {
        source: 'WHATSAPP',
        externalId: 'wamid.one',
        scope: 'WHATSAPP:+966551234567',
        contentHash: 'hash-one',
        senderIdentifier: '+966551234567',
        mimeType: 'image/jpeg',
        content: Buffer.from('one'),
      },
    });
    const second = await db.document.create({
      data: {
        source: 'WHATSAPP',
        externalId: 'wamid.two',
        scope: 'WHATSAPP:+966551234567',
        contentHash: 'hash-two',
        senderIdentifier: '+966551234567',
        mimeType: 'image/jpeg',
        content: Buffer.from('two'),
      },
    });

    await db.$transaction(async (tx) => {
      await tx.documentMatch.create({
        data: {
          documentId: first.id,
          transactionId: 1,
          confidence: 0.9,
          signals: { signals: { amount: 1 }, flags: [] },
          status: 'CANDIDATE',
        },
      });
      await tx.documentMatch.create({
        data: {
          documentId: second.id,
          transactionId: 1,
          confidence: 0.9,
          signals: { signals: { amount: 1 }, flags: [] },
          status: 'CANDIDATE',
        },
      });
      throw new Error('rollback-candidates');
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === 'rollback-candidates') return;
      throw error;
    });

    await db.documentMatch.create({
      data: {
        documentId: first.id,
        transactionId: 1,
        confidence: 0.9,
        signals: { signals: { amount: 1 }, flags: [] },
        status: 'CONFIRMED',
      },
    });

    await expect(
      db.documentMatch.create({
        data: {
          documentId: second.id,
          transactionId: 1,
          confidence: 0.8,
          signals: { signals: { amount: 1 }, flags: [] },
          status: 'AUTO_CONFIRMED',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a second confirmed match on the same document', async () => {
    const document = await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'msg_two_charges#0',
        scope: 'EMAIL:billing@alfanar-fuel.com.sa',
        contentHash: 'hash-two-charges',
        senderIdentifier: 'billing@alfanar-fuel.com.sa',
        mimeType: 'application/pdf',
        content: Buffer.from('statement'),
      },
    });

    await db.documentMatch.create({
      data: {
        documentId: document.id,
        transactionId: 6,
        confidence: 0.91,
        signals: { signals: { amount: 1 }, flags: [] },
        status: 'AUTO_CONFIRMED',
      },
    });

    await expect(
      db.documentMatch.create({
        data: {
          documentId: document.id,
          transactionId: 7,
          confidence: 0.7,
          signals: { signals: { amount: 0.5 }, flags: [] },
          status: 'CONFIRMED',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('records CONFIRMED and AUTO_CONFIRMED in both partial index predicates', async () => {
    const rows = await db.$queryRaw<Array<{ name: string; sql: string | null }>>`
      SELECT name, sql FROM sqlite_master
      WHERE name IN (
        'DocumentMatch_one_confirmed_per_transaction',
        'DocumentMatch_one_confirmed_per_document'
      )
    `;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.sql).toContain('CONFIRMED');
      expect(row.sql).toContain('AUTO_CONFIRMED');
    }
  });

  it('allows a CONFIRMED row after REJECTED and still rejects a second confirmation', async () => {
    const rejected = await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'msg_rejected#0',
        scope: 'EMAIL:billing@alfanar-fuel.com.sa',
        contentHash: 'hash-rejected',
        senderIdentifier: 'billing@alfanar-fuel.com.sa',
        mimeType: 'application/pdf',
        content: Buffer.from('rejected'),
      },
    });
    const confirmed = await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'msg_after_reject#0',
        scope: 'EMAIL:billing@alfanar-fuel.com.sa',
        contentHash: 'hash-after-reject',
        senderIdentifier: 'billing@alfanar-fuel.com.sa',
        mimeType: 'application/pdf',
        content: Buffer.from('after-reject'),
      },
    });
    await db.documentMatch.create({
      data: {
        documentId: rejected.id,
        transactionId: 8,
        confidence: 0.4,
        signals: { signals: { amount: 0 }, flags: [] },
        status: 'REJECTED',
      },
    });
    await db.documentMatch.create({
      data: {
        documentId: confirmed.id,
        transactionId: 8,
        confidence: 0.9,
        signals: { signals: { amount: 1 }, flags: [] },
        status: 'CONFIRMED',
      },
    });
    await expect(
      db.documentMatch.create({
        data: {
          documentId: rejected.id,
          transactionId: 8,
          confidence: 0.9,
          signals: { signals: { amount: 1 }, flags: [] },
          status: 'AUTO_CONFIRMED',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('document identity', () => {
  it('allows the same content hash for two scopes and rejects it inside one scope', async () => {
    await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'msg_scope_a#0',
        scope: 'EMAIL:billing@alfanar-fuel.com.sa',
        contentHash: 'same-bytes',
        senderIdentifier: 'billing@alfanar-fuel.com.sa',
        mimeType: 'application/pdf',
        content: Buffer.from('same'),
      },
    });
    await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'msg_scope_b#0',
        scope: 'EMAIL:billing@redsea-haulage.example',
        contentHash: 'same-bytes',
        senderIdentifier: 'billing@redsea-haulage.example',
        mimeType: 'application/pdf',
        content: Buffer.from('same'),
      },
    });
    await expect(
      db.document.create({
        data: {
          source: 'EMAIL',
          externalId: 'msg_scope_a_again#0',
          scope: 'EMAIL:billing@alfanar-fuel.com.sa',
          contentHash: 'same-bytes',
          senderIdentifier: 'billing@alfanar-fuel.com.sa',
          mimeType: 'application/pdf',
          content: Buffer.from('same'),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a second row with the same external id', async () => {
    await expect(
      db.document.create({
        data: {
          source: 'EMAIL',
          externalId: 'msg_keep#0',
          scope: 'EMAIL:other@example.com',
          contentHash: 'different-bytes',
          senderIdentifier: 'other@example.com',
          mimeType: 'application/pdf',
          content: Buffer.from('other'),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('keeps an extra transaction and its match when reference data is seeded again', async () => {
    await db.transaction.create({
      data: {
        id: 99,
        clientId: 1,
        cardLast4: '4242',
        driverPhone: '+966551234567',
        merchantName: 'EXTRA ROW',
        amount: 1111,
        currency: 'SAR',
        transactionAt: new Date('2025-06-01T00:00:00.000Z'),
      },
    });
    const document = await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'msg_extra#0',
        scope: 'EMAIL:billing@alfanar-fuel.com.sa',
        contentHash: 'hash-extra',
        senderIdentifier: 'billing@alfanar-fuel.com.sa',
        mimeType: 'application/pdf',
        content: Buffer.from('extra'),
      },
    });
    const match = await db.documentMatch.create({
      data: {
        documentId: document.id,
        transactionId: 99,
        confidence: 0.5,
        signals: { signals: { amount: 1 }, flags: [] },
        status: 'CANDIDATE',
      },
    });

    await seedReferenceData(db);

    expect(await db.transaction.findUnique({ where: { id: 99 } })).not.toBeNull();
    expect(await db.documentMatch.findUnique({ where: { id: match.id } })).not.toBeNull();
    expect(await db.transaction.count()).toBe(16);
  });

  it('rejects a match that points at a missing transaction', async () => {
    const document = await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'msg_missing_txn#0',
        scope: 'EMAIL:billing@alfanar-fuel.com.sa',
        contentHash: 'hash-missing-txn',
        senderIdentifier: 'billing@alfanar-fuel.com.sa',
        mimeType: 'application/pdf',
        content: Buffer.from('missing-txn'),
      },
    });
    await expect(
      db.documentMatch.create({
        data: {
          documentId: document.id,
          transactionId: 99999,
          confidence: 0.5,
          signals: { signals: {}, flags: [] },
          status: 'CANDIDATE',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});
