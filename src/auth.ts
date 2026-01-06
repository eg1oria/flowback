import jwt from 'jsonwebtoken';
import { Request, Response, CookieOptions } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const IS_PROD = process.env.NODE_ENV === 'production';

const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? 'none' : 'lax',
  maxAge: 604800000,
  path: '/',
};

export function createToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return typeof decoded === 'object' ? decoded.userId : null;
  } catch {
    return null;
  }
}

export function authorizeRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const userId = verifyToken(authHeader.substring(7));
    if (userId) return userId;
  }

  const cookieToken = req.cookies.auth;
  if (typeof cookieToken === 'string') {
    return verifyToken(cookieToken);
  }

  return null;
}

export function setAuthCookie(res: Response, userId: string): string {
  const token = createToken(userId);
  res.cookie('auth', token, COOKIE_OPTIONS);
  return token;
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie('auth', COOKIE_OPTIONS);
}
