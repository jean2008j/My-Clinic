import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one } from '../db.js';
import { HttpError, wrap } from '../middleware/error.js';
import { requireAuth, signToken } from '../middleware/auth.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  wrap(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await one<{ id: number; password_hash: string; role: 'admin' | 'provider' }>(
      'SELECT id, password_hash, role FROM users WHERE lower(email) = lower(?)',
      [email],
    );
    // Same error for unknown user / wrong password
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      throw new HttpError(401, 'invalid_credentials');
    }
    const provider = await one<{ id: number }>('SELECT id FROM providers WHERE user_id = ?', [user.id]);
    const authUser = { id: user.id, role: user.role, providerId: provider?.id ?? null };
    res.json({ token: signToken(authUser), user: authUser });
  }),
);

authRouter.get('/me', requireAuth(), (req, res) => {
  res.json({ user: req.user });
});
