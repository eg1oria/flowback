// ============ server.ts ============
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
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { usersRouter, authRouter, cartRouter, adminRouter } from './routes/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const flowersData = require('../db.json');

const server = express();
const PORT = process.env.PORT || 4000;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

const contactSchema = z.object({
  name: z.string().max(50).optional(),
  email: z.string().email('Неверный email').or(z.literal('')).optional(),
  phone: z.string().regex(/^\+?[0-9]{7,15}$/, 'Неверный формат телефона'),
  message: z.string().min(5, 'Сообщение слишком короткое').max(1000),
});

// Trust proxy for deployment (Heroku, Railway, Render, etc.)
server.set('trust proxy', 1);

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Слишком много запросов с вашего IP, попробуйте позже',
  standardHeaders: true,
  legacyHeaders: false,
});

const contactLimiter = rateLimit({
  windowMs: 60 * 1000,
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

// CORS configuration for production
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((url) => url.trim())
  : ['http://localhost:3000'];

console.log('🌐 Allowed Origins:', allowedOrigins);

server.use(
  cors({
    origin: (origin, callback) => {
      console.log('🔍 Request from origin:', origin); // Добавьте это

      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.log('❌ Origin blocked:', origin); // Добавьте это
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Logging
if (process.env.NODE_ENV === 'production') {
  server.use(morgan('combined'));
} else {
  server.use(morgan('dev'));
}

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
    console.error('CONTACT FORM ERROR:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API Routes
console.log('📍 Registering routes...');
server.use('/users', usersRouter);
console.log('✅ /users registered');
server.use('/auth', authRouter);
console.log('✅ /auth registered');
server.use('/cart', cartRouter);
console.log('✅ /cart registered');
server.use('/admin', adminRouter);
console.log('✅ /admin registered');

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

server.patch('/flowers/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      res.status(400).json({ error: 'Invalid ID format' });
      return;
    }

    const id = Number(req.params.id);
    const { rating } = req.body;

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'Рейтинг должен быть числом от 1 до 5' });
      return;
    }

    const flowerIndex = flowersData.flowers.findIndex((f: any) => f.id === id);

    if (flowerIndex === -1) {
      res.status(404).json({ error: 'Цветок не найден' });
      return;
    }

    // Update rating logic
    const flower = flowersData.flowers[flowerIndex];
    const currentRating = flower.rating || 0;
    const ratingCount = flower.ratingCount || 0;

    flower.ratingCount = ratingCount + 1;
    flower.rating = (currentRating * ratingCount + rating) / flower.ratingCount;

    // Save to file
    const dbPath = path.join(__dirname, '..', 'db.json');
    await fs.writeFile(dbPath, JSON.stringify(flowersData, null, 2), 'utf-8');

    res.json({
      success: true,
      flower: flowersData.flowers[flowerIndex],
    });
  } catch (error) {
    console.error('ERROR updating rating:', error);
    res.status(500).json({ error: 'Ошибка при обновлении рейтинга' });
  }
});

// Health check endpoint
server.get('/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
  });
});

// Root endpoint
server.get('/', (_req: Request, res: Response): void => {
  res.json({
    message: 'Flower Shop API',
    version: '1.0.0',
    endpoints: {
      auth: '/auth/*',
      users: '/users/*',
      cart: '/cart/*',
      flowers: '/flowers',
      admin: '/admin/*',
      contact: '/contact',
      health: '/health',
    },
  });
});

// 404 handler
server.use((_req: Request, res: Response): void => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
server.use((err: any, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('Error:', err);
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log('🔒 Security: Helmet, Rate Limiting, CORS enabled');
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Allowed Origins: ${allowedOrigins.join(', ')}`);
});

export default server;
