CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'OWNER_DRAW');
CREATE TYPE "DealType" AS ENUM ('QUOTE', 'INVOICE');
CREATE TYPE "DealStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'PAID', 'CANCELLED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "passwordHash" VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Business" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Membership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "role" VARCHAR(20) NOT NULL DEFAULT 'OWNER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FinancialTransaction" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "type" "TransactionType" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'ZAR',
  "description" VARCHAR(240) NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "customerId" TEXT,
  "dealId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialTransaction_amountMinor_check" CHECK ("amountMinor" > 0)
);
CREATE TABLE "Budget" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "operationsPercent" INTEGER NOT NULL DEFAULT 60,
  "reservePercent" INTEGER NOT NULL DEFAULT 20,
  "ownerDrawPercent" INTEGER NOT NULL DEFAULT 20,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Budget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Budget_percentages_check" CHECK (
    "operationsPercent" >= 0 AND "reservePercent" >= 0 AND "ownerDrawPercent" >= 0
    AND "operationsPercent" + "reservePercent" + "ownerDrawPercent" = 100
  )
);
CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Deal" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "reference" VARCHAR(40) NOT NULL,
  "type" "DealType" NOT NULL,
  "status" "DealStatus" NOT NULL DEFAULT 'DRAFT',
  "description" VARCHAR(1000) NOT NULL,
  "totalMinor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'ZAR',
  "dueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Deal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Deal_totalMinor_check" CHECK ("totalMinor" >= 0)
);
CREATE TABLE "DealItem" (
  "id" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "description" VARCHAR(200) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitMinor" BIGINT NOT NULL,
  CONSTRAINT "DealItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DealItem_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "DealItem_unitMinor_check" CHECK ("unitMinor" >= 0)
);
CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "recordType" VARCHAR(60) NOT NULL,
  "recordId" VARCHAR(80) NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "IdempotencyRecord" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "key" VARCHAR(100) NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Membership_userId_businessId_key" ON "Membership"("userId", "businessId");
CREATE INDEX "Membership_businessId_role_idx" ON "Membership"("businessId", "role");
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "FinancialTransaction_businessId_occurredAt_idx" ON "FinancialTransaction"("businessId", "occurredAt");
CREATE INDEX "FinancialTransaction_businessId_type_occurredAt_idx" ON "FinancialTransaction"("businessId", "type", "occurredAt");
CREATE INDEX "FinancialTransaction_customerId_idx" ON "FinancialTransaction"("customerId");
CREATE UNIQUE INDEX "Budget_businessId_key" ON "Budget"("businessId");
CREATE UNIQUE INDEX "Customer_businessId_email_key" ON "Customer"("businessId", "email");
CREATE INDEX "Customer_businessId_name_idx" ON "Customer"("businessId", "name");
CREATE UNIQUE INDEX "Deal_businessId_reference_key" ON "Deal"("businessId", "reference");
CREATE INDEX "Deal_businessId_createdAt_idx" ON "Deal"("businessId", "createdAt");
CREATE INDEX "Deal_customerId_status_idx" ON "Deal"("customerId", "status");
CREATE INDEX "DealItem_dealId_idx" ON "DealItem"("dealId");
CREATE INDEX "AuditEvent_businessId_createdAt_idx" ON "AuditEvent"("businessId", "createdAt");
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");
CREATE UNIQUE INDEX "IdempotencyRecord_businessId_key_key" ON "IdempotencyRecord"("businessId", "key");
CREATE INDEX "IdempotencyRecord_createdAt_idx" ON "IdempotencyRecord"("createdAt");

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
