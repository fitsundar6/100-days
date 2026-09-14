-- ============================================================
-- ALPHA X GYM — MIGRATION: ADD SECURE GYM ATTENDANCE SYSTEM
-- Models: gyms, gym_qr_tokens, gym_attendances, and client googleId
-- ============================================================

-- 1. Alter "clients" table: Add googleId, avatarUrl, make phone nullable
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "googleId" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE "clients" ALTER COLUMN "phone" DROP NOT NULL;

-- Create unique index on googleId
CREATE UNIQUE INDEX IF NOT EXISTS "clients_googleId_key" ON "clients"("googleId");

-- 2. Create "gyms" table
CREATE TABLE IF NOT EXISTS "gyms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Alpha X Gym',
    "latitude" DOUBLE PRECISION NOT NULL DEFAULT 12.9716,
    "longitude" DOUBLE PRECISION NOT NULL DEFAULT 77.5946,
    "allowedRadiusMeters" DOUBLE PRECISION NOT NULL DEFAULT 75.0,
    "openTime" TEXT NOT NULL DEFAULT '05:00',
    "closeTime" TEXT NOT NULL DEFAULT '22:00',
    "qrRefreshSeconds" INTEGER NOT NULL DEFAULT 30,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gyms_pkey" PRIMARY KEY ("id")
);

-- 3. Create "gym_qr_tokens" table
CREATE TABLE IF NOT EXISTS "gym_qr_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "token" TEXT,
    "gymId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gym_qr_tokens_pkey" PRIMARY KEY ("id")
);

-- Create unique index on tokenHash
CREATE UNIQUE INDEX IF NOT EXISTS "gym_qr_tokens_tokenHash_key" ON "gym_qr_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "gym_qr_tokens_gymId_idx" ON "gym_qr_tokens"("gymId");
CREATE INDEX IF NOT EXISTS "gym_qr_tokens_expiresAt_idx" ON "gym_qr_tokens"("expiresAt");

-- Add foreign key constraint to gyms
ALTER TABLE "gym_qr_tokens" ADD CONSTRAINT "gym_qr_tokens_gymId_fkey" 
    FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Create "gym_attendances" table
CREATE TABLE IF NOT EXISTS "gym_attendances" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "attendanceDate" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'present',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "gpsAccuracy" DOUBLE PRECISION,
    "distanceMeters" DOUBLE PRECISION,
    "locationVerified" BOOLEAN NOT NULL DEFAULT false,
    "qrTokenId" TEXT,
    "verificationMethod" TEXT NOT NULL DEFAULT 'dynamic_qr_gps',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gym_attendances_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: exactly one attendance per client per calendar date
CREATE UNIQUE INDEX IF NOT EXISTS "gym_attendances_clientId_attendanceDate_key" 
    ON "gym_attendances"("clientId", "attendanceDate");

-- Query performance indexes
CREATE INDEX IF NOT EXISTS "gym_attendances_clientId_idx" ON "gym_attendances"("clientId");
CREATE INDEX IF NOT EXISTS "gym_attendances_gymId_idx" ON "gym_attendances"("gymId");
CREATE INDEX IF NOT EXISTS "gym_attendances_attendanceDate_idx" ON "gym_attendances"("attendanceDate");
CREATE INDEX IF NOT EXISTS "gym_attendances_status_idx" ON "gym_attendances"("status");

-- Add foreign key constraints
ALTER TABLE "gym_attendances" ADD CONSTRAINT "gym_attendances_clientId_fkey" 
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gym_attendances" ADD CONSTRAINT "gym_attendances_gymId_fkey" 
    FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gym_attendances" ADD CONSTRAINT "gym_attendances_qrTokenId_fkey" 
    FOREIGN KEY ("qrTokenId") REFERENCES "gym_qr_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
