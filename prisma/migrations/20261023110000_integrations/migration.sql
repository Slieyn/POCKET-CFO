-- Integration hub, bank statement imports, and transaction provenance.
ALTER TABLE "FinancialTransaction"
  ADD COLUMN "source" VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "externalId" VARCHAR(160);

CREATE UNIQUE INDEX "FinancialTransaction_businessId_externalId_key"
  ON "FinancialTransaction"("businessId", "externalId");

CREATE TABLE "Integration" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'DISCONNECTED',
  "config" TEXT,
  "lastTestedAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportBatch" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "provider" VARCHAR(40) NOT NULL DEFAULT 'BANK_CSV',
  "fileName" VARCHAR(200) NOT NULL,
  "rowsRead" INTEGER NOT NULL,
  "rowsImported" INTEGER NOT NULL,
  "rowsSkipped" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Integration_businessId_provider_key" ON "Integration"("businessId", "provider");
CREATE INDEX "Integration_businessId_status_idx" ON "Integration"("businessId", "status");
CREATE INDEX "ImportBatch_businessId_createdAt_idx" ON "ImportBatch"("businessId", "createdAt");

ALTER TABLE "Integration" ADD CONSTRAINT "Integration_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
