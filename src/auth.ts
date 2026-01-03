// ============ auth.ts ============
import jwt from 'jsonwebtoken';
import { Request, Response, CookieOptions } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export function createToken(userId: string): string {
  return jwt.sign(
    {
      userId,
    },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

export function authorizeToken(token: string): string | undefined {
  let result: jwt.JwtPayload | string;

  try {
    result = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return undefined;
  }

  if (typeof result === 'object') {
    return result.userId;
  }

  return undefined;
}

export function authorizeRequest(request: Request): string | undefined {
  // Добавим логирование для отладки
  console.log('🔍 Checking auth cookie:', {
    hasCookie: !!request.cookies.auth,
    cookieValue: request.cookies.auth ? 'exists' : 'missing',
    allCookies: Object.keys(request.cookies),
  });

  const token = request.cookies.auth;

  if (typeof token === 'string') {
    const userId = authorizeToken(token);
    console.log('🔍 Token decoded:', userId ? 'valid' : 'invalid');
    return userId;
  }

  console.log('❌ No auth token found in cookies');
  return undefined;
}

export function authorizeResponse(response: Response, userId: string): Response {
  const isProduction = process.env.NODE_ENV === 'production';

  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: isProduction, // true только в production (HTTPS)
    sameSite: isProduction ? 'none' : 'lax', // 'none' для cross-origin в production
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
    path: '/',
  };

  console.log('🍪 Setting cookie with options:', {
    isProduction,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
  });

  return response.cookie('auth', createToken(userId), cookieOptions);
}

export function unauthorizeResponse(response: Response): Response {
  const isProduction = process.env.NODE_ENV === 'production';

  console.log('🗑️ Clearing cookie');

  return response.clearCookie('auth', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  });
}
