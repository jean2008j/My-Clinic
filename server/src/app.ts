import express from 'express';
import cors from 'cors';
import { join } from 'node:path';
import { config } from './config.js';
import { one } from './db.js';
import { errorHandler, wrap } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';
import { providerRouter } from './routes/provider.js';
import { requireAuth } from './middleware/auth.js';

/**
 * Builds the Express app (does not listen). Used by the standalone server (src/index.ts, which also serves the built
 * website through `clientDist`) and by the Vercel function (src/vercel.ts, where Vercel serves the website itself).
 */
export function createApp(clientDist?: string) {
  const app = express();

  // Behind a host's proxy (Render, Vercel, ...) req.ip must be the visitor's IP, or the rate limits would see one shared IP.
  if (config.isProd) app.set('trust proxy', 1);

  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', wrap(async (_req, res) => {
    await one('SELECT 1 AS ok');
    res.json({ ok: true, tz: config.tz });
  }));

  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/admin', requireAuth(['admin']), adminRouter);
  app.use('/api/provider', requireAuth(['provider']), providerRouter);

  // Unknown /api paths: JSON 404 (not the website page)
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  if (clientDist) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
