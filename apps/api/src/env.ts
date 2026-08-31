import { config } from 'dotenv';
import { z } from 'zod';

// .env lives at the monorepo root; pnpm runs this with cwd=apps/api.
config({ path: new URL('../../../.env', import.meta.url) });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  // Admin tokens are verified against this project's JWKS — no shared secret.
  SUPABASE_URL: z.string().url(),
  // Signs the tokens students get from /auth/login. Any long random string.
  AUTH_JWT_SECRET: z.string().min(32),
  // Comma-separated allowlist. Anything not listed is refused by CORS.
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
