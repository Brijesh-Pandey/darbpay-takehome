import type { PrismaClient } from '@prisma/client';

/**
 * Reference rows the matcher will use later.
 * 1  exact Alfanar fuel charge for the sample email day
 * 2 and 3  same client, same amount, same day, Albaik chain
 * 4  restaurant charge of 63.25 SAR (tip case)
 * 5  client 2 twin of transaction 1
 * Re-running this function updates those rows in place. It does not delete documents.
 */
const clients = [
  { id: 1, name: 'Northline Logistics' },
  { id: 2, name: 'Red Sea Haulage' },
] as const;

const emailSenders = [
  { email: 'billing@alfanar-fuel.com.sa', clientId: 1 },
  { email: 'billing@redsea-haulage.example', clientId: 2 },
] as const;

const driver = {
  northlinePrimary: '+966551234567',
  northlineSecond: '+966550111222',
  redSea: '+966552333444',
} as const;

type SeedTransaction = {
  id: number;
  clientId: number;
  cardLast4: string;
  driverPhone: string;
  merchantName: string;
  amount: number;
  transactionAt: Date;
};

const transactions: SeedTransaction[] = [
  {
    id: 1,
    clientId: 1,
    cardLast4: '4242',
    driverPhone: driver.northlinePrimary,
    merchantName: 'ALFANAR FUEL ST 04 RUH',
    amount: 12500,
    transactionAt: new Date('2025-06-14T09:21:00.000Z'),
  },
  {
    id: 2,
    clientId: 1,
    cardLast4: '4242',
    driverPhone: driver.northlinePrimary,
    merchantName: 'ALBAIK RUH 12',
    amount: 4800,
    transactionAt: new Date('2025-06-12T12:00:00.000Z'),
  },
  {
    id: 3,
    clientId: 1,
    cardLast4: '4242',
    driverPhone: driver.northlinePrimary,
    merchantName: 'ALBAIK RUH 07',
    amount: 4800,
    transactionAt: new Date('2025-06-12T12:30:00.000Z'),
  },
  {
    id: 4,
    clientId: 1,
    cardLast4: '1881',
    driverPhone: driver.northlinePrimary,
    merchantName: 'THE CHEFS TABLE RIYADH',
    amount: 6325,
    transactionAt: new Date('2025-06-10T18:00:00.000Z'),
  },
  {
    id: 5,
    clientId: 2,
    cardLast4: '4242',
    driverPhone: driver.redSea,
    merchantName: 'ALFANAR FUEL ST 04 RUH',
    amount: 12500,
    transactionAt: new Date('2025-06-14T09:21:00.000Z'),
  },
  {
    id: 6,
    clientId: 1,
    cardLast4: '1881',
    driverPhone: driver.northlineSecond,
    merchantName: 'JARIR BOOKSTORE OLAYA',
    amount: 8999,
    transactionAt: new Date('2025-06-08T10:00:00.000Z'),
  },
  {
    id: 7,
    clientId: 1,
    cardLast4: '4242',
    driverPhone: driver.northlinePrimary,
    merchantName: 'NAHDI PHARMACY RUH',
    amount: 3450,
    transactionAt: new Date('2025-06-07T08:00:00.000Z'),
  },
  {
    id: 8,
    clientId: 1,
    cardLast4: '1881',
    driverPhone: driver.northlineSecond,
    merchantName: 'SASCO FUEL ST 02 JED',
    amount: 21000,
    transactionAt: new Date('2025-06-06T06:00:00.000Z'),
  },
  {
    id: 9,
    clientId: 1,
    cardLast4: '4242',
    driverPhone: driver.northlinePrimary,
    merchantName: 'TAMIMI MARKETS RUH',
    amount: 15675,
    transactionAt: new Date('2025-06-05T15:00:00.000Z'),
  },
  {
    id: 10,
    clientId: 2,
    cardLast4: '9090',
    driverPhone: driver.redSea,
    merchantName: 'PANDA HYPER RUH',
    amount: 7340,
    transactionAt: new Date('2025-06-04T11:00:00.000Z'),
  },
  {
    id: 11,
    clientId: 2,
    cardLast4: '9090',
    driverPhone: driver.redSea,
    merchantName: 'STC PAY POS',
    amount: 5000,
    transactionAt: new Date('2025-06-03T09:00:00.000Z'),
  },
  {
    id: 12,
    clientId: 1,
    cardLast4: '1881',
    driverPhone: driver.northlineSecond,
    merchantName: 'EXTRA ELECTRONICS RUH',
    amount: 249900,
    transactionAt: new Date('2025-06-02T13:00:00.000Z'),
  },
  {
    id: 13,
    clientId: 1,
    cardLast4: '4242',
    driverPhone: driver.northlinePrimary,
    merchantName: 'DUNKIN DONUTS CC',
    amount: 1850,
    transactionAt: new Date('2025-06-01T07:30:00.000Z'),
  },
  {
    id: 14,
    clientId: 2,
    cardLast4: '9090',
    driverPhone: driver.redSea,
    merchantName: 'ALBAIK RUH 12',
    amount: 4800,
    transactionAt: new Date('2025-06-12T12:00:00.000Z'),
  },
  {
    id: 15,
    clientId: 1,
    cardLast4: '1881',
    driverPhone: driver.northlineSecond,
    merchantName: 'PETROMIN EXPRESS',
    amount: 9900,
    transactionAt: new Date('2025-05-30T16:00:00.000Z'),
  },
];

export type SeedResult = {
  clients: number;
  emailSenders: number;
  transactions: number;
};

export async function seedReferenceData(db: PrismaClient): Promise<SeedResult> {
  for (const client of clients) {
    await db.client.upsert({
      where: { id: client.id },
      create: { id: client.id, name: client.name },
      update: { name: client.name },
    });
  }

  for (const sender of emailSenders) {
    await db.clientEmailSender.upsert({
      where: { email: sender.email },
      create: { email: sender.email, clientId: sender.clientId },
      update: { clientId: sender.clientId },
    });
  }

  for (const transaction of transactions) {
    await db.transaction.upsert({
      where: { id: transaction.id },
      create: { ...transaction, currency: 'SAR' },
      update: {
        clientId: transaction.clientId,
        cardLast4: transaction.cardLast4,
        driverPhone: transaction.driverPhone,
        merchantName: transaction.merchantName,
        amount: transaction.amount,
        currency: 'SAR',
        transactionAt: transaction.transactionAt,
      },
    });
  }

  return {
    clients: await db.client.count(),
    emailSenders: await db.clientEmailSender.count(),
    transactions: await db.transaction.count(),
  };
}

async function main(): Promise<void> {
  const { disconnectPrisma, getPrisma } = await import('../lib/prisma');
  const prisma = getPrisma();
  try {
    const result = await seedReferenceData(prisma);
    console.log(JSON.stringify(result));
  } finally {
    await disconnectPrisma();
  }
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('prisma/seed.ts') || entry.endsWith('prisma/seed.js')) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
