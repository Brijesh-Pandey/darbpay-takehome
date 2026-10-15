-- A card-feed redelivery needs a stable key. Seeded rows stay null.
ALTER TABLE "Transaction" ADD COLUMN "externalRef" TEXT;
CREATE UNIQUE INDEX "Transaction_externalRef_key" ON "Transaction"("externalRef");
