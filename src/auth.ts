import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';

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
  const token = request.cookies.auth;

  if (typeof token === 'string') {
    return authorizeToken(token);
  }

  return undefined;
}

export function authorizeResponse(response: Response, userId: string): Response {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return response.cookie('auth', createToken(userId), {
    httpOnly: true,
    secure: isProduction, // HTTPS обязателен для production
    sameSite: isProduction ? 'none' : 'lax', // 'none' для cross-origin
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/', // Явно указываем путь
  });
}

export function unauthorizeResponse(response: Response): Response {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return response.clearCookie('auth', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  });
}