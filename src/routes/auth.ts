import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authorizeRequest, setAuthCookie, clearAuthCookie } from '../auth.js';
import { Users, Passwords } from '../database/index.js';

export const authRouter = Router();

const RegisterSchema = z.object({
  username: z.string().min(3, 'Имя должно содержать минимум 3 символа'),
  email: z.string().email('Некорректный формат email'),
  password: z.string().min(6, 'Пароль должен содержать минимум 6 символов'),
});

const LoginSchema = z.object({
  email: z.string().email('Некорректный формат email'),
  password: z.string().min(1),
});

authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = RegisterSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const { username, email, password } = parsed.data;

  try {
    const user = await Users.create(username, email);
    await Passwords.create(user.id, password);

    const token = setAuthCookie(res, user.id);

    res.status(201).json({
      user: { id: user.id, username: user.username, email: user.email },
      token,
    });
  } catch {
    res.status(409).json({ error: 'Этот email уже занят' });
  }
});

authRouter.post('/login', (req: Request, res: Response): void => {
  const parsed = LoginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const { email, password } = parsed.data;
  const user = Users.findOne((u) => u.email === email);

  if (!user || !Passwords.verify(user.id, password)) {
    res.status(401).json({ error: 'Неверный email или пароль' });
    return;
  }

  const token = setAuthCookie(res, user.id);

  res.json({
    user: { id: user.id, username: user.username, email: user.email },
    token,
  });
});

authRouter.post('/logout', (_req: Request, res: Response): void => {
  clearAuthCookie(res);
  res.json({ message: 'Вы успешно вышли из системы' });
});

authRouter.get('/check', (req: Request, res: Response): void => {
  const userId = authorizeRequest(req);

  if (!userId) {
    res.status(401).json({ isAuthenticated: false });
    return;
  }

  const user = Users.getOne(userId);

  if (!user) {
    res.status(404).json({ isAuthenticated: false });
    return;
  }

  res.json({
    isAuthenticated: true,
    user: { id: user.id, username: user.username, email: user.email },
  });
});