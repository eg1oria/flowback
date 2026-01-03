import { Router, Request, Response } from 'express';

import { authorizeRequest, unauthorizeResponse } from '../auth.js';
import { Cart, Users } from '../database/index.js';

export const usersRouter = Router();

usersRouter.get('/me', (req: Request, res: Response): void => {
  const userId = authorizeRequest(req);

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = Users.getOne(userId);

  if (!user) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }

  res.status(200).json({
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
  });
});

usersRouter.patch('/me', async (req: Request, res: Response): Promise<void> => {
  const userId = authorizeRequest(req);

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { username, email } = req.body;

  try {
    const updatedUser = await Users.update(userId, { username, email });

    if (!updatedUser) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    res.status(200).json({
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
    });
  } catch (error) {
    res.status(400).json({ error: 'Ошибка при обновлении профиля' });
  }
});

usersRouter.delete('/me', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = authorizeRequest(req);

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await Cart.clearForUser(userId);

    const deleted = await Users.delete(userId);

    if (!deleted) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    // Используем функцию unauthorizeResponse из auth.js
    // Она автоматически применит правильные настройки cookie
    unauthorizeResponse(res).status(200).json({ message: 'Аккаунт и корзина успешно удалены' });
  } catch (error) {
    console.error('DELETE USER ERROR:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});
