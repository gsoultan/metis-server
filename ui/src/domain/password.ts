/**
 * The minimum password length, matching MinPasswordLength in
 * server/domains/services/impl/user.go.
 *
 * Duplicated rather than fetched: it is a constant, and a form that only learns
 * the rule from a rejection makes the user guess. `passwordRuleMatchesServer`
 * in the test pins the two together.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** How long a generated password is: about 122 bits from the alphabet below. */
export const GENERATED_PASSWORD_LENGTH = 20;

// The alphabet leaves out characters that are easy to misread when a password
// is read aloud or copied off a screen by hand: I, l, O, 0 and 1. Every class
// still has plenty left, and a generated password holds one of each, so it
// passes any rule that asks for a mix.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+';
const PASSWORD_CLASSES = [UPPER, LOWER, DIGITS, SYMBOLS] as const;
const PASSWORD_ALPHABET = PASSWORD_CLASSES.join('');

/** Fills a byte array with random bytes; the browser's CSPRNG unless a test swaps it. */
export type RandomFill = (bytes: Uint8Array<ArrayBuffer>) => void;

const cryptoFill: RandomFill = (bytes) => {
  crypto.getRandomValues(bytes);
};

/**
 * A string of `length` characters, each picked uniformly from `charset` with
 * the browser's cryptographic random source.
 *
 * A byte taken modulo the alphabet size favours the low characters whenever
 * 256 is not a multiple of it, so bytes at or above the largest multiple are
 * thrown away and drawn again (rejection sampling). Never Math.random.
 */
export function randomString(length: number, charset: string, fill: RandomFill = cryptoFill): string {
  if (charset.length === 0 || charset.length > 256) {
    throw new Error('randomString needs an alphabet of 1 to 256 characters');
  }
  const limit = 256 - (256 % charset.length);
  const out: string[] = [];
  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(Math.max(16, length * 2));
  while (out.length < length) {
    fill(bytes);
    for (const byte of bytes) {
      if (byte < limit) {
        out.push(charset[byte % charset.length]);
        if (out.length === length) break;
      }
    }
  }
  return out.join('');
}

/**
 * A new random password, at least MIN_PASSWORD_LENGTH long, with an upper-case
 * letter, a lower-case letter, a digit and a symbol in it.
 *
 * A draw that misses a class is thrown away whole and drawn again, rather than
 * a missing character being patched in at a fixed place, so every password
 * that has all four classes stays equally likely. At 20 characters a draw
 * misses one about 5% of the time.
 *
 * The value is only returned: callers put it in a form field and nowhere else.
 */
export function generatePassword(length: number = GENERATED_PASSWORD_LENGTH, fill: RandomFill = cryptoFill): string {
  const size = Math.max(length, MIN_PASSWORD_LENGTH, PASSWORD_CLASSES.length);
  for (;;) {
    const candidate = randomString(size, PASSWORD_ALPHABET, fill);
    if (PASSWORD_CLASSES.every((chars) => [...candidate].some((c) => chars.includes(c)))) {
      return candidate;
    }
  }
}
