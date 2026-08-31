import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

// Prisma 7 reads the connection string when the adapter is constructed, so the
// .env has to be loaded before that — regardless of which app imported us first
// or what its cwd is. Walk up to the monorepo root looking for it.
for (let dir = dirname(fileURLToPath(import.meta.url)); ; ) {
  if (existsSync(join(dir, '.env'))) {
    config({ path: join(dir, '.env') });
    break;
  }
  const up = dirname(dir);
  if (up === dir) break;
  dir = up;
}

/**
 * One Prisma client for the whole process. Stashed on globalThis so tsx/vite
 * hot-reloads in dev don't leak a new connection pool per reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export * from './generated/prisma/client.js';
