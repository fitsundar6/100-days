import crypto from 'crypto';
import QRCode from 'qrcode';
import prisma from '../lib/prisma';
import { queryWithTimeout } from '../lib/db-safe';

const SIGNING_SECRET = process.env.JWT_SECRET || 'alphaxgym_dynamic_qr_signing_secret_2026';
const DEFAULT_TTL_SECONDS = 30; // Tokens refresh every 30 seconds

export interface GeneratedQrToken {
  token: string;
  tokenHash: string;
  gymId: string;
  gymName: string;
  expiresAt: Date;
  expiresInSeconds: number;
  checkinUrl: string;
  qrDataUrl: string; // Base64 data URL for fast crisp rendering on displays
  issuedAt: Date;
}

// In-memory fallback cache for high availability if PostgreSQL is reconnecting
const memoryTokenCache = new Map<string, {
  token: string;
  tokenHash: string;
  gymId: string;
  expiresAt: number;
  isUsed: boolean;
}>();

/**
 * Periodically purge expired tokens from in-memory cache
 */
function purgeMemoryCache() {
  const now = Date.now();
  for (const [hash, entry] of memoryTokenCache.entries()) {
    if (entry.expiresAt < now) {
      memoryTokenCache.delete(hash);
    }
  }
}

/**
 * Sign a token payload with HMAC SHA-256
 */
function signPayload(payload: string): string {
  return crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
}

/**
 * Verify token HMAC signature to immediately detect forged tokens
 */
export function verifyTokenSignature(tokenString: string): { valid: boolean; gymId?: string; expiresAt?: number } {
  try {
    const parts = tokenString.split('.');
    if (parts.length !== 4) return { valid: false };

    const [randomPart, gymIdPart, expiryPart, signature] = parts;
    const payload = `${randomPart}.${gymIdPart}.${expiryPart}`;
    const expectedSig = signPayload(payload);

    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      const expiresAt = parseInt(expiryPart, 10);
      return {
        valid: true,
        gymId: gymIdPart,
        expiresAt,
      };
    }
    return { valid: false };
  } catch (err) {
    return { valid: false };
  }
}

/**
 * Generates a short-lived, signed dynamic QR token for gym check-in display
 */
export async function generateDynamicGymQr(baseUrl: string, specificGymId?: string): Promise<GeneratedQrToken> {
  purgeMemoryCache();

  // 1. Resolve Gym or use default facility
  let gym = null;
  try {
    if (specificGymId) {
      gym = await queryWithTimeout(prisma.gym.findUnique({ where: { id: specificGymId } }), 600);
    }
    if (!gym) {
      gym = await queryWithTimeout(prisma.gym.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      }), 600);
    }
  } catch (err) {
    console.warn('Database offline while fetching gym, using fallback configuration:', err);
  }

  const gymId = gym?.id || 'default-alphax-facility';
  const gymName = gym?.name || 'Alpha X Gym — Main Facility';
  const ttlSeconds = gym?.qrRefreshSeconds || DEFAULT_TTL_SECONDS;

  const now = Date.now();
  const expiresAtEpoch = now + ttlSeconds * 1000;
  const expiresAt = new Date(expiresAtEpoch);
  const issuedAt = new Date(now);

  // 2. Generate cryptographically signed token: <random32>.<gymId>.<expiresAtEpoch>.<signature>
  const randomPart = crypto.randomBytes(16).toString('hex');
  const payload = `${randomPart}.${gymId}.${expiresAtEpoch}`;
  const signature = signPayload(payload);
  const token = `${payload}.${signature}`;

  // 3. Compute SHA-256 token hash for lookup & deduplication
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // 4. Save to in-memory cache
  memoryTokenCache.set(tokenHash, {
    token,
    tokenHash,
    gymId,
    expiresAt: expiresAtEpoch,
    isUsed: false,
  });

  // 5. Attempt PostgreSQL database persistence
  try {
    // Only attempt if gym exists in DB with foreign key
    if (gym?.id) {
      await queryWithTimeout(prisma.gymQrToken.create({
        data: {
          tokenHash,
          token,
          gymId: gym.id,
          expiresAt,
          isUsed: false,
        },
      }), 600);

      // Cleanup expired tokens older than 5 minutes to keep DB small
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
      prisma.gymQrToken.deleteMany({
        where: { expiresAt: { lt: fiveMinutesAgo } },
      }).catch(() => {});
    }
  } catch (dbErr) {
    console.warn('Could not persist GymQrToken to DB (memory fallback active):', dbErr);
  }

  // 6. Build client checkin URL (no sensitive data in URL)
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const checkinUrl = `${cleanBase}/checkin?token=${encodeURIComponent(token)}`;

  // 7. Generate high-resolution, dark-mode branded QR code
  const qrDataUrl = await QRCode.toDataURL(checkinUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 8,
    width: 380,
    color: {
      dark: '#111317', // Alpha X dark surface
      light: '#ffffff', // Clean white background for camera scanning
    },
  });

  return {
    token,
    tokenHash,
    gymId,
    gymName,
    expiresAt,
    expiresInSeconds: ttlSeconds,
    checkinUrl,
    qrDataUrl,
    issuedAt,
  };
}

/**
 * Validates a dynamic QR token submitted during check-in
 * Returns verification result with reasons for rejection
 */
export async function validateDynamicQrToken(tokenString: string): Promise<{
  isValid: boolean;
  rejectionReason?: string;
  gymId?: string;
  qrTokenRecordId?: string;
}> {
  if (!tokenString || typeof tokenString !== 'string') {
    return { isValid: false, rejectionReason: 'QR token is missing or malformed' };
  }

  // 1. Signature Check (Reject forged tokens immediately)
  const sigCheck = verifyTokenSignature(tokenString);
  if (!sigCheck.valid) {
    return { isValid: false, rejectionReason: 'Forged or invalid QR token signature' };
  }

  // 2. Expiration Check (Clock validation)
  const now = Date.now();
  if (!sigCheck.expiresAt || sigCheck.expiresAt < now) {
    return { isValid: false, rejectionReason: 'This QR code has expired. Please scan the current gym QR code.' };
  }

  const tokenHash = crypto.createHash('sha256').update(tokenString).digest('hex');

  // 3. Database Check (if available)
  try {
    const dbToken = await queryWithTimeout(prisma.gymQrToken.findUnique({
      where: { tokenHash },
    }), 600);

    if (dbToken) {
      if (dbToken.isUsed) {
        return { isValid: false, rejectionReason: 'This QR token has already been used. Please scan the current gym QR code.' };
      }
      if (dbToken.expiresAt.getTime() < now) {
        return { isValid: false, rejectionReason: 'This QR code has expired. Please scan the current gym QR code.' };
      }

      return {
        isValid: true,
        gymId: dbToken.gymId,
        qrTokenRecordId: dbToken.id,
      };
    }
  } catch (err) {
    console.warn('DB lookup failed, checking in-memory token cache:', err);
  }

  // 4. In-Memory Cache Check
  const memToken = memoryTokenCache.get(tokenHash);
  if (memToken) {
    if (memToken.isUsed) {
      return { isValid: false, rejectionReason: 'This QR token has already been used. Please scan the current gym QR code.' };
    }
    if (memToken.expiresAt < now) {
      return { isValid: false, rejectionReason: 'This QR code has expired. Please scan the current gym QR code.' };
    }

    return {
      isValid: true,
      gymId: memToken.gymId,
    };
  }

  // If validly signed and within time window (even if DB dropped record)
  return {
    isValid: true,
    gymId: sigCheck.gymId,
  };
}

/**
 * Mark a QR token as used after successful check-in
 */
export async function markQrTokenUsed(tokenString: string, recordId?: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(tokenString).digest('hex');

  const mem = memoryTokenCache.get(tokenHash);
  if (mem) {
    mem.isUsed = true;
  }

  try {
    if (recordId) {
      await queryWithTimeout(prisma.gymQrToken.update({
        where: { id: recordId },
        data: { isUsed: true, usedAt: new Date() },
      }), 600);
    } else {
      await queryWithTimeout(prisma.gymQrToken.updateMany({
        where: { tokenHash },
        data: { isUsed: true, usedAt: new Date() },
      }), 600);
    }
  } catch (err) {
    // Non-fatal
  }
}
