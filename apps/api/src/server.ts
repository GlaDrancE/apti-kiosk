import { prisma } from '@apti/db';
import { env } from './env.js';
import { createApp } from './app.js';

const server = createApp().listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT} (${env.NODE_ENV})`);
});

// Close the pool on the way out — Supabase's pooler has a finite connection
// budget and a container restart loop will otherwise exhaust it.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}
