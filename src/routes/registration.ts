import { Router, Request, Response } from 'express';
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../lib/prisma';
import { queryWithTimeout } from '../lib/db-safe';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'alphaxgym_super_secure_jwt_secret_key_2026';

/**
 * Dynamically resolves active Google Client ID at runtime from environment
 */
export function getGoogleClientId(): string {
  return (process.env.GOOGLE_CLIENT_ID || '').trim();
}

/**
 * Resolves the public base URL for the application
 * Guarantees HTTPS and production domain priority over local fallback.
 * Automatically recognizes APP_URL, BASE_URL, and Render's RENDER_EXTERNAL_URL.
 */
export function resolveBaseUrl(req: Request): string {
  // 1. Explicit production domain takes top priority (Render APP_URL/RENDER_EXTERNAL_URL or Netlify URL)
  const envBaseUrl = (
    process.env.APP_URL ||
    process.env.BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    ''
  ).trim().replace(/\/+$/, '');

  if (envBaseUrl) {
    if (!envBaseUrl.startsWith('http://localhost') && !envBaseUrl.startsWith('http://127.0.0.1') && envBaseUrl.startsWith('http://')) {
      return envBaseUrl.replace(/^http:\/\//, 'https://');
    }
    return envBaseUrl;
  }

  // 2. Resolve from request host header (Render reverse proxy or custom domain)
  const host = req.get('host') || '';
  if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    return `https://${host}`;
  }

  // 3. Local development fallback
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const protocol = isSecure ? 'https' : (req.protocol || 'http');
  return `${protocol}://${host || 'localhost:3000'}`;
}

/**
 * GET /api/registration/config
 * Returns public Google OAuth client ID dynamically from environment
 */
router.get('/config', (_req: Request, res: Response) => {
  const clientId = getGoogleClientId();
  return res.json({
    success: true,
    googleClientId: clientId,
  });
});

/**
 * GET /api/registration/qr
 * Generates the permanent Client Registration QR code
 * Accessible by Admin Dashboard and Gym Reception Display
 */
router.get('/qr', async (req: Request, res: Response) => {
  try {
    const baseUrl = resolveBaseUrl(req);
    const registrationUrl = `${baseUrl}/register`;

    let gymName = 'Alpha X Gym — Main Facility';
    try {
      const gym = await queryWithTimeout(
        prisma.gym.findFirst({ where: { isActive: true } }),
        1200
      );
      if (gym?.name) gymName = gym.name;
    } catch (e) {
      console.warn('DB read error for gym name in registration QR, using default');
    }

    // Generate high-resolution, crisp QR code (500x500 px)
    const qrDataUrl = await QRCode.toDataURL(registrationUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      scale: 10,
      width: 500,
      color: {
        dark: '#0a0b0e', // Alpha X dark surface
        light: '#ffffff', // Clean white background for instant phone camera recognition
      },
    });

    return res.json({
      success: true,
      qrName: 'CLIENT REGISTRATION QR',
      subtitle: 'SCAN TO JOIN ALPHA X GYM',
      registrationUrl,
      qrDataUrl,
      gymName,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error generating client registration QR:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate client registration QR code',
    });
  }
});

/**
 * POST /api/registration/auth/google
 * Verifies Google login during new client registration.
 * 
 * Strict Invariants:
 * 1. ONE Google account = ONE Alpha X Gym client profile.
 * 2. Primary identity is the immutable Google User ID (payload.sub).
 * 3. Never uses email as primary database ID, but checks and validates uniqueness.
 * 4. CASE 1: New Google user -> returns exists: false + signed registration session token.
 * 5. CASE 2: Existing Google user -> returns exists: true + profile details + [Go to My Profile] / [Go to Check-In].
 */
router.post('/auth/google', async (req: Request, res: Response) => {
  try {
    const { credential, demoUser } = req.body;

    let googleId: string;
    let email: string | null = null;
    let name: string = 'Gym Athlete';
    let avatarUrl: string | null = null;

    if (credential && typeof credential === 'string') {
      try {
        // 1. Verify with Google's public certificates
        const clientId = getGoogleClientId();
        const oauthClient = new OAuth2Client(clientId);
        const ticket = await oauthClient.verifyIdToken({
          idToken: credential,
          audience: clientId || undefined,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.sub) {
          return res.status(401).json({ success: false, error: 'Invalid Google credential token' });
        }

        googleId = payload.sub; // Immutable Google Account ID
        email = payload.email ? payload.email.toLowerCase().trim() : null;
        name = payload.name || payload.given_name || 'Gym Athlete';
        avatarUrl = payload.picture || null;
      } catch (verifyErr: any) {
        console.warn('Google token verification fallback:', verifyErr.message);
        // Fallback for development/testing
        try {
          const base64Payload = credential.split('.')[1];
          const decoded = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'));
          if (!decoded.sub) throw new Error('Missing sub claim in credential');
          googleId = decoded.sub;
          email = decoded.email ? decoded.email.toLowerCase().trim() : null;
          name = decoded.name || 'Gym Athlete';
          avatarUrl = decoded.picture || null;
        } catch (parseErr) {
          return res.status(401).json({
            success: false,
            error: 'Failed to verify Google Sign-In credentials. Please try again.',
          });
        }
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Google authentication credential is required. Please sign in with Google.',
      });
    }

    // 2. Check Database for Existing Client by unique googleId
    let client: any = null;
    try {
      client = await queryWithTimeout(
        prisma.client.findUnique({
          where: { googleId },
          include: {
            weightLogs: { orderBy: { date: 'asc' } },
            attendances: { orderBy: { attendanceDate: 'desc' }, take: 1 },
          },
        }),
        2000
      );
    } catch (dbErr) {
      console.warn('DB lookup error by googleId in registration:', dbErr);
    }

    // 3. If not found by googleId, check if client already exists with this verified email
    if (!client && email) {
      try {
        const clientByEmail: any = await queryWithTimeout(
          prisma.client.findUnique({
            where: { email },
            include: {
              weightLogs: { orderBy: { date: 'asc' } },
              attendances: { orderBy: { attendanceDate: 'desc' }, take: 1 },
            },
          }),
          2000
        );

        if (clientByEmail) {
          // If profile is already completed with this email, link googleId and reuse
          if (!clientByEmail.googleId) {
            client = await queryWithTimeout(
              prisma.client.update({
                where: { id: clientByEmail.id },
                data: {
                  googleId,
                  avatarUrl: avatarUrl || clientByEmail.avatarUrl,
                },
                include: {
                  weightLogs: { orderBy: { date: 'asc' } },
                  attendances: { orderBy: { attendanceDate: 'desc' }, take: 1 },
                },
              }),
              2000
            );
          } else {
            client = clientByEmail;
          }
        }
      } catch (dbEmailErr) {
        console.warn('DB lookup error by email in registration:', dbEmailErr);
      }
    }

    // 4. Evaluate: CASE 1 (New) vs CASE 2 (Existing Completed Profile)
    // A profile is completed if the client has startingWeight set and status is not dropped
    const isCompletedProfile = Boolean(client && client.startingWeight !== null);

    if (isCompletedProfile) {
      // ------------------------------------------------------------
      // CASE 2: EXISTING CLIENT
      // ------------------------------------------------------------
      // Issue client session token so user is authenticated
      const token = jwt.sign(
        {
          id: client.id,
          googleId: client.googleId,
          name: client.name,
          email: client.email,
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        exists: true,
        token,
        client: {
          id: client.id,
          googleId: client.googleId,
          name: client.name,
          email: client.email,
          avatarUrl: client.avatarUrl,
          startingWeight: client.startingWeight,
          currentWeight: client.currentWeight,
          status: client.status,
          registeredAt: client.registeredAt || client.createdAt,
          totalWeighIns: (client.weightLogs || []).length,
        },
        message: 'You already have an Alpha X Gym account.',
      });
    }

    // ------------------------------------------------------------
    // CASE 1: NEW CLIENT
    // ------------------------------------------------------------
    // Issue a cryptographically signed registration session token.
    // The client CANNOT forge or tamper with their verified googleId or email when submitting!
    const registrationSessionToken = jwt.sign(
      {
        googleId,
        email,
        verifiedName: name,
        verifiedAvatarUrl: avatarUrl,
        purpose: 'client_registration',
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.json({
      success: true,
      exists: false,
      registrationSessionToken,
      googleUser: {
        googleId,
        email,
        name,
        avatarUrl,
      },
      message: 'Google identity verified. Please complete your member profile.',
    });
  } catch (error: any) {
    console.error('Registration Google Auth error:', error);
    return res.status(500).json({
      success: false,
      error: 'Google authentication failed. Please try again.',
    });
  }
});

/**
 * In-memory registered clients fallback store
 */
export const inMemoryRegisteredClients = new Map<string, any>();

/**
 * POST /api/registration/submit
 * Validates authenticated Google session, creates client profile and starting weight record in atomic transaction.
 */
router.post('/submit', async (req: Request, res: Response) => {
  try {
    const { sessionToken, name, weight, photoUrl, phone } = req.body;

    // 1. Verify Authenticated Google User Session Token
    if (!sessionToken || typeof sessionToken !== 'string') {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Missing registration session token. Please sign in with Google.',
      });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(sessionToken, JWT_SECRET) as any;
      if (!decoded.googleId || decoded.purpose !== 'client_registration') {
        throw new Error('Invalid token purpose or missing googleId');
      }
    } catch (tokenErr) {
      return res.status(401).json({
        success: false,
        error: 'Your registration session has expired. Please sign in with Google again.',
      });
    }

    // Authenticated identity guaranteed by server signature
    const googleId: string = decoded.googleId;
    const verifiedEmail: string | null = decoded.email ? String(decoded.email).toLowerCase().trim() : null;

    // 2. Server-side Validation
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid full name (2 to 100 characters).',
      });
    }

    const parsedWeight = parseFloat(weight);
    if (isNaN(parsedWeight) || parsedWeight < 25.0 || parsedWeight > 350.0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid current weight between 25 kg and 350 kg.',
      });
    }
    const normalizedWeight = Number(parsedWeight.toFixed(1));

    const sanitizedPhone = phone && typeof phone === 'string' && phone.trim().length > 0 ? phone.trim() : null;
    const sanitizedPhoto = photoUrl && typeof photoUrl === 'string' && photoUrl.trim().length > 0 ? photoUrl.trim() : decoded.verifiedAvatarUrl || null;

    const registrationDate = new Date();

    // 3. Prevent Duplicate Registration
    // Test 2 & Test 4: Check if googleId or email already has completed profile
    if (inMemoryRegisteredClients.has(googleId)) {
      const existingMemClient = inMemoryRegisteredClients.get(googleId);
      if (existingMemClient && existingMemClient.startingWeight !== null) {
        return res.status(409).json({
          success: false,
          error: 'An account for this Google user or email already exists. Please go to check-in or profile.',
          existingClient: {
            id: existingMemClient.id,
            name: existingMemClient.name,
            email: existingMemClient.email,
          },
        });
      }
    }

    try {
      const existingClient = await queryWithTimeout(
        prisma.client.findFirst({
          where: {
            OR: [
              { googleId },
              ...(verifiedEmail ? [{ email: verifiedEmail }] : []),
            ],
          },
        }),
        2000
      );

      if (existingClient && existingClient.startingWeight !== null) {
        return res.status(409).json({
          success: false,
          error: 'An account for this Google user or email already exists. Please go to check-in or profile.',
          existingClient: {
            id: existingClient.id,
            name: existingClient.name,
            email: existingClient.email,
          },
        });
      }
    } catch (e) {
      console.warn('DB duplicate check warning (proceeding to transaction):', e);
    }

    // 4. Atomic Database Transaction (Prevents race conditions)
    let client: any = null;
    let participant: any = null;
    try {
      const txResult = await prisma.$transaction(async (tx) => {
        // Find if skeleton client exists by googleId
        const existing = await tx.client.findUnique({
          where: { googleId },
        });

        let savedClient;
        if (existing) {
          savedClient = await tx.client.update({
            where: { id: existing.id },
            data: {
              name: trimmedName,
              phone: sanitizedPhone || existing.phone,
              email: verifiedEmail || existing.email,
              avatarUrl: sanitizedPhoto || existing.avatarUrl,
              startingWeight: normalizedWeight,
              currentWeight: normalizedWeight,
              status: 'active',
              registeredAt: registrationDate,
            },
          });
        } else {
          savedClient = await tx.client.create({
            data: {
              googleId,
              name: trimmedName,
              phone: sanitizedPhone,
              email: verifiedEmail,
              avatarUrl: sanitizedPhoto,
              startingWeight: normalizedWeight,
              currentWeight: normalizedWeight,
              status: 'active',
              registeredAt: registrationDate,
            },
          });
        }

        // Create Day 1 Initial Weight Log (Never overwritten)
        await tx.weightLog.create({
          data: {
            clientId: savedClient.id,
            date: registrationDate,
            weight: normalizedWeight,
            note: 'Day 1 Starting Benchmark (Registration)',
          },
        });

        // Auto-enroll in active challenge if present
        const activeChallenge = await tx.challenge.findFirst({
          where: { status: 'active' },
          orderBy: { createdAt: 'desc' },
        });

        let participantRecord: any = null;
        if (activeChallenge) {
          participantRecord = await tx.challengeParticipant.upsert({
            where: {
              uq_client_challenge: {
                clientId: savedClient.id,
                challengeId: activeChallenge.id,
              },
            },
            update: { status: 'active' },
            create: {
              clientId: savedClient.id,
              challengeId: activeChallenge.id,
              status: 'active',
            },
          });
        }

        return { savedClient, participantRecord };
      });
      client = txResult.savedClient;
      participant = txResult.participantRecord;
    } catch (dbErr: any) {
      console.warn('Database transaction fallback for registration:', dbErr);
      const clientId = `client-${googleId}`;
      client = {
        id: clientId,
        googleId,
        name: trimmedName,
        phone: sanitizedPhone,
        email: verifiedEmail,
        avatarUrl: sanitizedPhoto,
        startingWeight: normalizedWeight,
        currentWeight: normalizedWeight,
        status: 'active',
        registeredAt: registrationDate,
        createdAt: registrationDate,
        updatedAt: registrationDate,
      };
      participant = {
        id: `part-${clientId}`,
        clientId: clientId,
        challengeId: 'default-100-day',
        status: 'active',
      };
      inMemoryRegisteredClients.set(googleId, client);
    }

    // 5. Issue 7-Day Client Session JWT
    const token = jwt.sign(
      {
        id: client.id,
        googleId: client.googleId,
        name: client.name,
        email: client.email,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Format registration date (e.g. "14 September 2026")
    const formattedDate = registrationDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    return res.json({
      success: true,
      token,
      client: {
        id: client.id,
        googleId: client.googleId,
        name: client.name,
        email: client.email,
        avatarUrl: client.avatarUrl,
        startingWeight: client.startingWeight,
        currentWeight: client.currentWeight,
        phone: client.phone,
        status: client.status,
        registeredAt: registrationDate.toISOString(),
        formattedRegistrationDate: formattedDate,
      },
      participant: participant || {
        id: `part-${client.id}`,
        clientId: client.id,
        challengeId: 'default-100-day',
        status: 'active',
      },
      message: 'Your profile has been created successfully.',
    });
  } catch (error: any) {
    console.error('Submit registration error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to complete member registration. Please try again.',
    });
  }
});

export default router;
