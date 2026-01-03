import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { authorizeResponse, unauthorizeResponse, authorizeRequest } from '../auth.js';
import { IUser, Users, Passwords } from '../database/index.js';

export const authRouter = Router();

const RegisterSchema = z.object({
  username: z.string().min(3, 'Имя должно содержать минимум 3 символа'),
  email: z.string().email({ message: 'Некорректный формат email' }),
  password: z.string().min(6, 'Пароль должен содержать минимум 6 символов'),
});

const LoginSchema = z.object({
  email: z.string().email({ message: 'Некорректный формат email' }),
  password: z.string(),
});

authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  const bodyParseResult = RegisterSchema.safeParse(req.body);

  if (!bodyParseResult.success) {
    res.status(400).json({
      error: bodyParseResult.error.issues[0].message,
    });
    return;
  }

  const { username, email, password } = bodyParseResult.data;

  let user: IUser;

  try {
    user = await Users.create(username, email);
  } catch (error) {
    res.status(409).json({
      error: 'Этот email уже занят',
    });
    return;
  }

  await Passwords.create(user.id, password);

  authorizeResponse(res, user.id)
    .status(201)
    .json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
});

authRouter.post('/login', (req: Request, res: Response): void => {
  const bodyParseResult = LoginSchema.safeParse(req.body);

  if (!bodyParseResult.success) {
    res.status(400).json({
      error: bodyParseResult.error.issues[0].message,
    });
    return;
  }

  const { email, password } = bodyParseResult.data;

  const user = Users.findOne((user) => user.email === email);

  if (!user || !Passwords.verify(user.id, password)) {
    res.status(401).json({
      error: 'Неверный email или пароль',
    });
    return;
  }

  authorizeResponse(res, user.id)
    .status(200)
    .json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
});

authRouter.post('/logout', (_req: Request, res: Response): void => {
  unauthorizeResponse(res).status(200).json({
    message: 'Вы успешно вышли из системы',
  });
});

authRouter.get('/check', (req: Request, res: Response): void => {
  const userId = authorizeRequest(req);

  if (!userId) {
    res.status(401).json({
      isAuthenticated: false,
    });
    return;
  }

  const user = Users.getOne(userId);

  if (!user) {
    res.status(404).json({
      isAuthenticated: false,
    });
    return;
  }

  res.status(200).json({
    isAuthenticated: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
    },
  });
});
