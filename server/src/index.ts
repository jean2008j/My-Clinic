import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createApp } from './app.js';

// If the website was built (client: npm run build), this server serves it too: one address for everything.
const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
const app = createApp(existsSync(clientDist) ? clientDist : undefined);

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
