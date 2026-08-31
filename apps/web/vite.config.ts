import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Env lives at the repo root so one .env drives both apps.
  envDir: '../../',
});
