import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export function createToken(userId: string): string {
  return jwt.sign(
    {
      userId,
    },
    JWT_SECRET,
    { expiresIn: '7d' }, // Токен действителен 7 дней
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
  return response.cookie('auth', createToken(userId), {
    httpOnly: true,
    secure: true, // Всегда true на production
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // ВАЖНО!
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function unauthorizeResponse(response: Response): Response {
  return response.clearCookie('auth', {
    httpOnly: true,
    secure: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
}
