import { SignJWT, createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import { prisma, type UserProfile } from '@apti/db';
import { env } from '../env.js';
import { unauthorized } from '../lib/errors.js';
import { verifyPassword } from '../lib/password.js';

/* ------------------------------------------------------------------ *
 * Two kinds of caller, one middleware.
 *
 *  - Admins sign in through Supabase Auth. Their tokens are ES256, verified
 *    against the project's published JWKS.
 *  - Students never touch Supabase. An admin creates their accounts in bulk;
 *    they sign in with a roll number and password and get an HS256 token this
 *    API signs itself.
 *
 * The `iss` claim decides which path a token takes, so neither verification
 * ever runs against a token meant for the other.
 * ------------------------------------------------------------------ */

const LOCAL_ISSUER = 'apti-kiosk';
const LOCAL_TOKEN_TTL = '12h';

interface SupabaseClaims {
  sub: string;
  email?: string;
  user_metadata?: { full_name?: string; college_name?: string };
}

// jose caches the key set and refetches on rotation, so this is created once.
const jwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', env.SUPABASE_URL));

const localSecret = new TextEncoder().encode(env.AUTH_JWT_SECRET);

/* ---- students: local credentials ---- */

/** Sign in a student. Returns the profile and a token this API can verify. */
export async function loginStudent(loginId: string, password: string) {
  const user = await prisma.userProfile.findUnique({ where: { loginId: loginId.trim() } });

  // Same error and same work either way: a distinct "no such user" reply would
  // let anyone enumerate valid roll numbers.
  const ok = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !ok) throw unauthorized('Incorrect roll number or password');

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(LOCAL_ISSUER)
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(LOCAL_TOKEN_TTL)
    .sign(localSecret);

  return { token, user };
}

/* ---- admins: Supabase Auth ---- */

/**
 * Resolve the UserProfile behind a Supabase token.
 *
 *  1. Already linked by supabaseUserId — normal path.
 *  2. A profile exists for the email but was never linked (seeded admin) —
 *     link it now.
 *  3. Nobody — create a STUDENT profile. Roles are only ever raised by an admin.
 */
async function resolveSupabaseProfile(claims: SupabaseClaims): Promise<UserProfile> {
  const linked = await prisma.userProfile.findUnique({
    where: { supabaseUserId: claims.sub },
  });
  if (linked) return linked;

  const email = claims.email?.toLowerCase();
  if (!email) throw unauthorized('Token has no email claim');

  const fullName = claims.user_metadata?.full_name ?? null;
  const collegeName = claims.user_metadata?.college_name ?? null;

  const byEmail = await prisma.userProfile.findUnique({ where: { email } });
  if (byEmail) {
    return prisma.userProfile.update({
      where: { id: byEmail.id },
      data: {
        supabaseUserId: claims.sub,
        fullName: byEmail.fullName ?? fullName,
        collegeName: byEmail.collegeName ?? collegeName,
      },
    });
  }

  return prisma.userProfile.create({
    data: { supabaseUserId: claims.sub, email, fullName, collegeName, role: 'STUDENT' },
  });
}

/* ---- the single entry point used by requireAuth ---- */

/** Verify a bearer token of either kind and return the profile behind it. */
export async function authenticate(token: string): Promise<UserProfile> {
  let issuer: string | undefined;
  try {
    issuer = decodeJwt(token).iss;
  } catch {
    throw unauthorized('Malformed token');
  }

  if (issuer === LOCAL_ISSUER) {
    let sub: string | undefined;
    try {
      ({ payload: { sub } } = await jwtVerify(token, localSecret, { issuer: LOCAL_ISSUER }));
    } catch (err) {
      throw unauthorized(`Invalid or expired session: ${(err as Error).message}`);
    }
    const user = sub ? await prisma.userProfile.findUnique({ where: { id: sub } }) : null;
    // The account was deleted while the token was still valid.
    if (!user) throw unauthorized('Account no longer exists');
    return user;
  }

  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: `${env.SUPABASE_URL}/auth/v1` });
    if (!payload.sub) throw new Error('token has no sub');
    return await resolveSupabaseProfile(payload as unknown as SupabaseClaims);
  } catch (err) {
    if (err instanceof Error && err.name === 'HttpError') throw err;
    throw unauthorized(`Invalid or expired token: ${(err as Error).message}`);
  }
}
