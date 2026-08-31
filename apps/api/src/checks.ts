/**
 * Self-check for the pure logic that scoring and the test runner depend on.
 * Run with: pnpm --filter @apti/api check
 *
 * Deliberately no test framework and no database — these are the pieces where a
 * silent regression would mis-grade a student.
 */
import assert from 'node:assert/strict';
import { MAX_STRIKES, STRIKE_COALESCE_MS, isStrike, type EventType } from '@apti/shared';
import { seededShuffle, saltFromId } from './lib/shuffle.js';
import { parseCsv, toCsv } from './lib/csv.js';
import { generatePassword, hashPassword, verifyPassword } from './lib/password.js';
import { sameSet } from './services/scoring.service.js';

/* ---- answer-key comparison ---- */
assert.equal(sameSet(['a'], ['a']), true);
assert.equal(sameSet(['a', 'b'], ['b', 'a']), true, 'order must not matter');
assert.equal(sameSet(['a'], ['a', 'b']), false, 'partial selection is not correct');
assert.equal(sameSet(['a', 'b'], ['a']), false, 'over-selection is not correct');
assert.equal(sameSet([], ['a']), false, 'blank is not correct');
assert.equal(sameSet(['a', 'a'], ['a', 'b']), false, 'duplicates must not fake a match');

/* ---- deterministic shuffle: same seed, same paper on reload ---- */
const items = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'];
assert.deepEqual(seededShuffle(items, 42), seededShuffle(items, 42), 'seed must be stable');
assert.notDeepEqual(
  seededShuffle(items, 42),
  seededShuffle(items, 43),
  'different students must get different orders',
);
assert.deepEqual([...seededShuffle(items, 42)].sort(), [...items].sort(), 'no item may be lost');
assert.notEqual(saltFromId('abc'), saltFromId('abd'), 'salt must vary per question');
assert.deepEqual(
  seededShuffle(items, 42, saltFromId('q1')),
  seededShuffle(items, 42, saltFromId('q1')),
  'salted shuffle must also be stable',
);

/* ---- CSV round-trip, including the fields that break naive parsers ---- */
const csv = toCsv(
  ['email', 'note'],
  [{ email: 'a@b.com', note: 'has, comma and "quotes"' }, { email: 'c@d.com', note: null }],
);
const rows = parseCsv(csv);
assert.equal(rows.length, 2);
assert.equal(rows[0]!.note, 'has, comma and "quotes"', 'quoted commas must survive a round-trip');
assert.equal(rows[1]!.note, '');
assert.equal(parseCsv('Email,Score\r\nA@B.com,10')[0]!.score, '10', 'headers are lower-cased');

/* ---- strike counting: the rule that ends an exam ----
   Mirrors the coalescing in antiCheat.service.recordEvents. If this drifts from
   that function the student-facing count stops matching the warning text. */
function countStrikes(
  events: { eventType: EventType; at: number }[],
  lastStrikeAt = -Infinity,
): { strikes: number; lastStrikeAt: number } {
  let last = lastStrikeAt;
  let strikes = 0;
  for (const e of events.filter((x) => isStrike(x.eventType)).sort((a, b) => a.at - b.at)) {
    if (e.at - last < STRIKE_COALESCE_MS) continue;
    strikes++;
    last = e.at;
  }
  return { strikes, lastStrikeAt: last };
}

const t = 1_700_000_000_000;

assert.equal(isStrike('WINDOW_BLUR'), true);
assert.equal(isStrike('TAB_HIDDEN'), false, 'tab-hidden rides along with blur — counting both would double-charge one alt-tab');
assert.equal(isStrike('COPY'), false, 'copy is scored for review, it is not a strike');

assert.equal(
  countStrikes([
    { eventType: 'WINDOW_BLUR', at: t },
    { eventType: 'TAB_HIDDEN', at: t + 5 },
    { eventType: 'FULLSCREEN_EXIT', at: t + 40 },
  ]).strikes,
  1,
  'one alt-tab fires several listeners and must cost exactly one strike',
);

assert.equal(
  countStrikes([
    { eventType: 'WINDOW_BLUR', at: t },
    { eventType: 'WINDOW_BLUR', at: t + STRIKE_COALESCE_MS + 1 },
  ]).strikes,
  2,
  'two separate departures are two strikes',
);

// Across batches: the second flush must not re-charge the burst already counted.
const first = countStrikes([{ eventType: 'WINDOW_BLUR', at: t }]);
assert.equal(first.strikes, 1);
assert.equal(
  countStrikes([{ eventType: 'FULLSCREEN_EXIT', at: t + 100 }], first.lastStrikeAt).strikes,
  0,
  'coalescing must hold across separate event batches',
);

assert.equal(countStrikes([{ eventType: 'PASTE', at: t }]).strikes, 0);
assert.ok(MAX_STRIKES >= 2, 'a student must get at least one warning before being submitted');

/* ---- passwords ---- */
const pw = generatePassword();
assert.equal(pw.length, 10);
assert.match(pw, /^[A-Za-z2-9]+$/, 'no ambiguous glyphs on a printed credential sheet');
assert.notEqual(generatePassword(), generatePassword(), 'passwords must not repeat');

const stored = await hashPassword('correct horse');
assert.notEqual(stored, 'correct horse', 'the plaintext must never be what is stored');
assert.equal(await verifyPassword('correct horse', stored), true);
assert.equal(await verifyPassword('Correct horse', stored), false, 'passwords are case-sensitive');
assert.equal(await verifyPassword('correct horse', null), false, 'an account with no password never authenticates');
assert.equal(await verifyPassword('x', 'garbage'), false, 'a malformed hash must not throw');
assert.notEqual(
  await hashPassword('same'),
  await hashPassword('same'),
  'equal passwords must not produce equal hashes — the salt has to be random',
);

console.log('all checks passed');
