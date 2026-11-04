import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export type Role = 'admin' | 'provider';
export interface AuthUser {
  id: number;
  role: Role;
  providerId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: '12h' });
}

export function requireAuth(roles?: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    try {
      const payload = jwt.verify(token, config.jwtSecret) as AuthUser;
      if (roles && !roles.includes(payload.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'invalid_token' });
    }
  };
}
