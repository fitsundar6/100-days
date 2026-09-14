import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'alphaxgym_super_secure_jwt_secret_key_2026';

export interface AuthenticatedRequest extends Request {
  admin?: {
    id: string;
    email: string;
    role: string;
  };
}

export interface ClientAuthenticatedRequest extends Request {
  client?: {
    id: string;
    googleId: string;
    name: string;
    email: string | null;
  };
}

export function requireAdminAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Admin authentication token required',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
    };

    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Invalid or expired admin token',
    });
  }
}

/**
 * Middleware requiring a valid Client authentication JWT (issued upon Google Sign-In)
 */
export function requireClientAuth(req: ClientAuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Gym member authentication required. Please log in with Google.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      googleId: string;
      name: string;
      email: string | null;
    };

    if (!decoded.id || !decoded.googleId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid member credentials',
      });
    }

    req.client = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Session expired. Please sign in with Google again.',
    });
  }
}

