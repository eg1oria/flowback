import { Router, Request, Response, NextFunction } from 'express';
import { authorizeRequest } from '../auth.js';
import { Cart, Users } from '../database/index.js';

export const adminRouter = Router();

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'leontevegor57@gmail.com')
  .split(',')
  .map((e) => e.trim());

console.log('🔧 ADMIN_EMAILS loaded:', process.env.ADMIN_EMAILS);
console.log('🔧 ADMIN_EMAILS array:', ADMIN_EMAILS);

function isAdmin(req: Request, res: Response, next: NextFunction): void {
  const userId = authorizeRequest(req);

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = Users.getOne(userId);

  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    res.status(403).json({ error: 'Доступ запрещен. Требуются права администратора' });
    return;
  }

  next();
}

adminRouter.get('/users', isAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = Users.getAll();

    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const cartCount = await Cart.getCountForUser(user.id);
        const cartTotal = await Cart.getTotalForUser(user.id);

        return {
          id: user.id,
          username: user.username,
          email: user.email,
          createdAt: user.createdAt,
          cartItemsCount: cartCount,
          cartTotal: cartTotal,
        };
      }),
    );

    res.json({
      users: usersWithStats,
      total: users.length,
    });
  } catch (error) {
    console.error('GET users error:', error);
    res.status(500).json({ error: 'Ошибка при получении списка пользователей' });
  }
});

adminRouter.delete(
  '/users/:userId',
  isAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const adminId = authorizeRequest(req);

      if (userId === adminId) {
        res.status(400).json({ error: 'Вы не можете удалить свой собственный аккаунт' });
        return;
      }

      const user = Users.getOne(userId);

      if (!user) {
        res.status(404).json({ error: 'Пользователь не найден' });
        return;
      }

      await Cart.clearForUser(userId);

      const deleted = await Users.delete(userId);

      if (!deleted) {
        res.status(404).json({ error: 'Пользователь не найден' });
        return;
      }

      res.json({
        success: true,
        message: `Пользователь ${user.email} успешно удален`,
      });
    } catch (error) {
      console.error('DELETE user error:', error);
      res.status(500).json({ error: 'Ошибка при удалении пользователя' });
    }
  },
);

adminRouter.get('/check', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = authorizeRequest(req);

    console.log('🔍 Admin check - userId:', userId);
    console.log('🔍 Admin emails from env:', ADMIN_EMAILS);

    if (!userId) {
      console.log('❌ No userId - not authenticated');
      res.json({ isAdmin: false, reason: 'Not authenticated' });
      return;
    }

    const user = Users.getOne(userId);
    console.log('🔍 User found:', user?.email);

    if (!user) {
      console.log('❌ User not found in database');
      res.json({ isAdmin: false, reason: 'User not found' });
      return;
    }

    const isAdminUser = ADMIN_EMAILS.includes(user.email);
    console.log('🔍 Is admin?', isAdminUser);

    res.json({
      isAdmin: isAdminUser,
      user: isAdminUser
        ? {
            id: user.id,
            username: user.username,
            email: user.email,
          }
        : undefined,
      debug: {
        userEmail: user.email,
        adminEmails: ADMIN_EMAILS,
        isMatch: isAdminUser,
      },
    });
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Ошибка при проверке прав' });
  }
});
