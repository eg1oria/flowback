import { Router, Request, Response } from 'express';
import { authorizeRequest, clearAuthCookie } from '../auth.js';
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

  res.json({
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

    res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
    });
  } catch {
    res.status(400).json({ error: 'Ошибка при обновлении профиля' });
  }
});

usersRouter.delete('/me', async (req: Request, res: Response): Promise<void> => {
  const userId = authorizeRequest(req);

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    await Cart.clearForUser(userId);
    const deleted = await Users.delete(userId);

    if (!deleted) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    clearAuthCookie(res);
    res.json({ message: 'Аккаунт и корзина успешно удалены' });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});
