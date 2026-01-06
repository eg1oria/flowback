import express, { json, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import morgan from 'morgan';
import { z } from 'zod';
import fetch from 'node-fetch';
import { createRequire } from 'module';

import { usersRouter, authRouter, cartRouter } from './routes/index.js';

dotenv.config();

const require = createRequire(import.meta.url);
const flowersData = require('../db.json');

const server = express();
const PORT = process.env.PORT || 4000;
const IS_PROD = process.env.NODE_ENV === 'production';

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const sanitizePhone = (phone: string): string => phone.replace(/[^\d+]/g, '');

const contactSchema = z.object({
  name: z.string().max(50).optional(),
  email: z.string().email('Неверный email').or(z.literal('')).optional(),
  phone: z.string().regex(/^\+?[0-9]{7,15}$/, 'Неверный формат телефона'),
  message: z.string().min(5, 'Сообщение слишком короткое').max(1000),
});

server.set('trust proxy', 1);

const generalLimiter = rateLimit({
  windowMs: 900000,
  max: 100,
  message: 'Слишком много запросов с вашего IP, попробуйте позже',
  standardHeaders: true,
  legacyHeaders: false,
});

const contactLimiter = rateLimit({
  windowMs: 60000,
  max: 5,
  message: 'Слишком много запросов, попробуйте позже',
  standardHeaders: true,
  legacyHeaders: false,
});

server.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

server.use(json({ limit: '10kb' }));
server.use(mongoSanitize());
server.use(cookieParser());

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((url) => url.trim())
  : ['http://localhost:3000'];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

server.use(cors(corsOptions));
server.options('*', cors(corsOptions));

server.use(IS_PROD ? morgan('combined') : morgan('dev'));
server.use(generalLimiter);

interface TelegramResponse {
  ok: boolean;
  result?: any;
  description?: string;
}

server.post('/contact', contactLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = contactSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({ error: result.error.errors[0].message });
      return;
    }

    const { name, email, phone, message } = result.data;

    const text = `
💐Новое сообщение с сайта:

${name ? `Имя: ${escapeHtml(name)}` : 'Имя: Не указано'}
${email ? `Email: ${escapeHtml(email)}` : 'Email: Не указано'}
Телефон: ${escapeHtml(sanitizePhone(phone))}
Сообщение: ${escapeHtml(message)}
`;

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      res.status(500).json({ error: 'Ошибка конфигурации сервера' });
      return;
    }

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });

    const telegramResult = (await response.json()) as TelegramResponse;

    if (!telegramResult.ok) {
      res.status(500).json({ error: 'Ошибка при отправке сообщения' });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

server.use('/users', usersRouter);
server.use('/auth', authRouter);
server.use('/cart', cartRouter);

server.get('/flowers', (_req: Request, res: Response): void => {
  res.json(flowersData.flowers);
});

server.get('/flowers/:id', (req: Request, res: Response): void => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(400).json({ error: 'Invalid ID format' });
    return;
  }

  const id = Number(req.params.id);
  const flower = flowersData.flowers.find((f: any) => f.id === id);

  if (!flower) {
    res.status(404).json({ error: 'Цветок не найден' });
    return;
  }

  res.json(flower);
});

server.get('/health', (_req: Request, res: Response): void => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
  });
});

server.get('/', (_req: Request, res: Response): void => {
  res.json({
    message: 'Flower Shop API',
    version: '1.0.0',
    endpoints: {
      auth: '/auth/*',
      users: '/users/*',
      cart: '/cart/*',
      flowers: '/flowers',
      contact: '/contact',
      health: '/health',
    },
  });
});

server.use((_req: Request, res: Response): void => {
  res.status(404).json({ error: 'Route not found' });
});

server.use((err: any, _req: Request, res: Response, _next: NextFunction): void => {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({
    error: message,
    ...(!IS_PROD && { stack: err.stack }),
  });
});

const shutdown = () => {
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () => {
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Origins: ${allowedOrigins.join(', ')}`);
});

export default server;