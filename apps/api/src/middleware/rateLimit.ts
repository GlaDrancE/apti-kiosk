import rateLimit from 'express-rate-limit';

const common = { standardHeaders: true as const, legacyHeaders: false };

/** Baseline limit for the whole API. */
export const globalLimiter = rateLimit({
  ...common,
  windowMs: 60_000,
  limit: 300,
  message: { error: 'Too many requests, slow down' },
});

/**
 * Autosave and event batches are called on a timer by every live test taker, so
 * they need far more headroom than a normal endpoint — but still a ceiling, so a
 * runaway client loop cannot hammer the DB.
 */
export const attemptWriteLimiter = rateLimit({
  ...common,
  windowMs: 60_000,
  limit: 120,
  message: { error: 'Too many attempt writes' },
});

/** CSV imports are heavy and rare. */
export const importLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60_000,
  limit: 20,
  message: { error: 'Too many imports, try again later' },
});

/**
 * Sign-in. Tight, because this endpoint is the one an attacker would grind
 * roll numbers against — they are short and guessable by design.
 */
export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60_000,
  limit: 20,
  skipSuccessfulRequests: true,
  message: { error: 'Too many sign-in attempts, try again later' },
});
