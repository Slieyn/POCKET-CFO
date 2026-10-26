-- Calendar and task planning for the workspace team.
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'DONE');

CREATE TABLE "Task" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "notes" VARCHAR(1000),
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "durationMinutes" INTEGER NOT NULL DEFAULT 30,
  "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
  "assignedToId" TEXT,
  "createdById" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Task_businessId_scheduledFor_idx" ON "Task"("businessId", "scheduledFor");
CREATE INDEX "Task_businessId_status_scheduledFor_idx" ON "Task"("businessId", "status", "scheduledFor");
CREATE INDEX "Task_assignedToId_scheduledFor_idx" ON "Task"("assignedToId", "scheduledFor");

ALTER TABLE "Task" ADD CONSTRAINT "Task_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
