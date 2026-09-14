-- ============================================================
-- ALPHA X GYM — MIGRATION: ADD CLIENT REGISTRATION FIELDS
-- Fields: registeredAt timestamp, unique index on email
-- ============================================================

-- 1. Alter "clients" table: Add registeredAt column
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. Create unique index on email
CREATE UNIQUE INDEX IF NOT EXISTS "clients_email_key" ON "clients"("email");
