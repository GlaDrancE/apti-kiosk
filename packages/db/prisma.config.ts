import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// .env lives at the monorepo root; the Prisma CLI runs with cwd=packages/db.
config({ path: new URL('../../.env', import.meta.url) });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Pooled (pgbouncer) connection for the running app.
    url: env('DATABASE_URL'),
    // Direct connection — migrations and introspection can't run through pgbouncer.
    directUrl: env('DIRECT_URL'),
  },
});
