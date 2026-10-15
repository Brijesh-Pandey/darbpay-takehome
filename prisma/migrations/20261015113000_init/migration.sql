-- CreateTable
CREATE TABLE "Client" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ClientEmailSender" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "clientId" INTEGER NOT NULL,
    CONSTRAINT "ClientEmailSender_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientId" INTEGER NOT NULL,
    "cardLast4" TEXT NOT NULL,
    "driverPhone" TEXT,
    "merchantName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "transactionAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "senderIdentifier" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "statusReason" TEXT,
    "filename" TEXT,
    "mimeType" TEXT NOT NULL,
    "content" BLOB NOT NULL,
    "documentType" TEXT,
    "merchantName" TEXT,
    "vatNumber" TEXT,
    "totalAmount" INTEGER,
    "currency" TEXT,
    "documentDate" DATETIME,
    "cardLast4" TEXT,
    "invoiceNumber" TEXT,
    "rawText" TEXT,
    "extractionConfidence" REAL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStartedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DocumentMatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentId" INTEGER NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "confidence" REAL NOT NULL,
    "signals" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CANDIDATE',
    "decidedBy" TEXT,
    "decidedAt" DATETIME,
    CONSTRAINT "DocumentMatch_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DocumentMatch_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientEmailSender_email_key" ON "ClientEmailSender"("email");

-- CreateIndex
CREATE INDEX "ClientEmailSender_clientId_idx" ON "ClientEmailSender"("clientId");

-- CreateIndex
CREATE INDEX "Transaction_clientId_idx" ON "Transaction"("clientId");

-- CreateIndex
CREATE INDEX "Transaction_driverPhone_idx" ON "Transaction"("driverPhone");

-- CreateIndex
CREATE UNIQUE INDEX "Document_externalId_key" ON "Document"("externalId");

-- CreateIndex
CREATE INDEX "Document_status_receivedAt_idx" ON "Document"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_scope_contentHash_key" ON "Document"("scope", "contentHash");

-- CreateIndex
CREATE INDEX "DocumentMatch_transactionId_idx" ON "DocumentMatch"("transactionId");

-- CreateIndex
CREATE INDEX "DocumentMatch_documentId_status_idx" ON "DocumentMatch"("documentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentMatch_documentId_transactionId_key" ON "DocumentMatch"("documentId", "transactionId");

-- Hand-written partial unique indexes (ADR 0005). Prisma schema language cannot express them.
-- One CONFIRMED or AUTO_CONFIRMED match per transaction, and one per document.
CREATE UNIQUE INDEX "DocumentMatch_one_confirmed_per_transaction"
  ON "DocumentMatch"("transactionId") WHERE "status" IN ('CONFIRMED', 'AUTO_CONFIRMED');
CREATE UNIQUE INDEX "DocumentMatch_one_confirmed_per_document"
  ON "DocumentMatch"("documentId") WHERE "status" IN ('CONFIRMED', 'AUTO_CONFIRMED');
