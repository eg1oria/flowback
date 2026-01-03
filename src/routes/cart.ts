import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authorizeRequest } from '../auth.js';
import { Cart } from '../database/index.js';
import fetch from 'node-fetch';

export const cartRouter = Router();

const AddItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  price: z.number().positive(),
  image: z.string(),
  count: z.number().int().positive().default(1),
});

const UpdateCountSchema = z.object({
  itemId: z.string(),
  count: z.number().int().min(0),
});

const CheckoutSchema = z.object({
  phone: z.string(),
  name: z.string().max(50, 'Слишком длинное имя'),
  adres: z.string(),
  postCard: z.boolean(),
  postCardText: z.string(),
});

cartRouter.post('/add', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🍪 Cookies:', req.cookies);
    console.log('📨 Headers:', {
      origin: req.headers.origin,
      cookie: req.headers.cookie,
      'content-type': req.headers['content-type'],
    });

    const userId = authorizeRequest(req);

    console.log('👤 UserId from token:', userId);

    if (!userId) {
      console.log('❌ No userId - returning 401');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parseResult = AddItemSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: parseResult.error.issues[0].message,
      });
      return;
    }

    const { productId, name, price, image, count } = parseResult.data;

    const item = await Cart.addItem(userId, productId, name, price, image, count);
    console.log('✅ Item added successfully');
    res.status(201).json(item);
  } catch (error) {
    console.error('ADD cart error:', error);
    res.status(500).json({ error: 'Ошибка при добавлении товара' });
  }
});

cartRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = authorizeRequest(req);

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const items = Cart.getAllForUser(userId);
    const total = await Cart.getTotalForUser(userId);
    const count = await Cart.getCountForUser(userId);

    res.json({
      items,
      total,
      count,
    });
  } catch (error) {
    console.error('GET cart error:', error);
    res.status(500).json({ error: 'Ошибка при получении корзины' });
  }
});

cartRouter.post('/update', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = authorizeRequest(req);

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parseResult = UpdateCountSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: parseResult.error.issues[0].message,
      });
      return;
    }

    const { itemId, count } = parseResult.data;

    const item = Cart.getOne(itemId);

    if (!item || item.userId !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const success = await Cart.updateCount(itemId, count);

    if (!success) {
      res.status(404).json({ error: 'Товар не найден' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('UPDATE cart error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении товара' });
  }
});

cartRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = authorizeRequest(req);

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const itemId = req.params.id;

    const item = Cart.getOne(itemId);

    if (!item || item.userId !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const success = await Cart.removeItem(itemId);

    if (!success) {
      res.status(404).json({ error: 'Товар не найден' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('DELETE cart error:', error);
    res.status(500).json({ error: 'Ошибка при удалении товара' });
  }
});

cartRouter.post('/checkout', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = authorizeRequest(req);

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parseResult = CheckoutSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: parseResult.error.issues[0].message,
      });
      return;
    }

    const { phone, name, adres, postCard, postCardText } = parseResult.data;

    const items = Cart.getAllForUser(userId);

    if (items.length === 0) {
      res.status(400).json({ error: 'Корзина пуста' });
      return;
    }

    const total = await Cart.getTotalForUser(userId);

    const text = `
🛒 Новый заказ!

👤 Пользователь:

Id: ${userId}
${name ? `Имя: ${name}` : 'Имя: Не указано'}

Телефон: ${phone}
Адрес: ${adres}


Товары:
${items
  .map(
    (item) => `• ${item.name} — ${item.count} шт × ${item.price} ₽ = ${item.count * item.price} ₽`,
  )
  .join('\n')}

  ${
    postCard
      ? `Открытка: Да 
  Текст к открытке: 

  ${postCardText}
    `
      : 'Открытка: Нет'
  }


💰 Итого: ${total} ₽
    `.trim();

    const BOT_TOKEN = process.env.TG_BOT_TOKEN_ORDER;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      console.error('Telegram credentials missing');
      res.status(500).json({ error: 'Telegram не настроен' });
      return;
    }

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
      }),
    });

    const result: any = await response.json();

    if (!result.ok) {
      console.error('Telegram error:', result);
      res.status(500).json({ error: 'Ошибка при отправке в Telegram' });
      return;
    }

    await Cart.clearForUser(userId);

    res.json({
      success: true,
      message: 'Заказ успешно отправлен',
      orderId: result.result?.message_id,
    });
  } catch (e) {
    console.error('CHECKOUT ERROR:', e);
    res.status(500).json({ error: 'Ошибка при отправке заказа' });
  }
});

cartRouter.delete('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = authorizeRequest(req);

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await Cart.clearForUser(userId);
    res.json({ success: true, message: 'Корзина очищена' });
  } catch (error) {
    console.error('CLEAR cart error:', error);
    res.status(500).json({ error: 'Ошибка при очистке корзины' });
  }
});

cartRouter.get('/total', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = authorizeRequest(req);

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const total = await Cart.getTotalForUser(userId);
    const count = await Cart.getCountForUser(userId);

    res.json({ total, count });
  } catch (error) {
    console.error('GET total error:', error);
    res.status(500).json({ error: 'Ошибка при получении суммы' });
  }
});
