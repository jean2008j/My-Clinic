// Bundles the API into ONE file for Vercel:  api/index.js  (at the repository root).
// Run `npm run build:vercel` from /server after any change in /server/src, then commit api/index.js.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../../api/index.js', import.meta.url));
await build({
  entryPoints: [fileURLToPath(new URL('../src/vercel.ts', import.meta.url))],
  outfile: out,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  minify: true,
  legalComments: 'none',
  // Vercel calls module.exports as the request handler; an Express app is exactly that.
  footer: { js: 'module.exports = module.exports.default || module.exports;' },
});
console.log('Wrote', out);
