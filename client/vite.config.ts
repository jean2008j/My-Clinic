import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, /api/* is forwarded to the Express server, so the browser sees one origin (no CORS issues).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
