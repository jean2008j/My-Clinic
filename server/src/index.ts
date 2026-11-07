import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import { config } from './config.js';
import { one } from './db.js';
import { errorHandler, wrap } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';
import { providerRouter } from './routes/provider.js';
import { requireAuth } from './middleware/auth.js';

const app = express();

// Behind a host's proxy (Render, Railway, ...) req.ip must be the visitor's IP, or the rate limits would see one shared IP.
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

// If the website was built (client: npm run build), the server serves it too: one address for everything.
const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
}

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
