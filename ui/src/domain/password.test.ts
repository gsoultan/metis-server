import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engineRoot } from './engineSource.test';
import { GENERATED_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, generatePassword, randomString } from './password';

describe('the password rule', () => {
  // The form tells the user the rule before they submit, which means the rule
  // is written down twice. Two copies drift: the server would start refusing
  // passwords the form had already called acceptable, and the user would get a
  // rejection with no field to blame it on.
  it('is the same length the server enforces', () => {
    const source = readFileSync(
      join(engineRoot(), 'server', 'domains', 'services', 'impl', 'user.go'),
      'utf8',
    );
    const match = source.match(/const MinPasswordLength = (\d+)/);

    expect(match).not.toBeNull();
    expect(MIN_PASSWORD_LENGTH).toBe(Number(match![1]));
  });
});

describe('generatePassword', () => {
  it('meets the length rule and holds every kind of character', () => {
    for (let i = 0; i < 200; i++) {
      const password = generatePassword();
      expect(password.length).toBe(GENERATED_PASSWORD_LENGTH);
      expect(password.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
      expect(password).not.toMatch(/[Il0O1]/);
    }
  });

  it('never goes below the server minimum, whatever length is asked for', () => {
    expect(generatePassword(3).length).toBe(MIN_PASSWORD_LENGTH);
  });

  it('gives a different password each time', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generatePassword()));
    expect(seen.size).toBe(500);
  });

  it('draws from crypto.getRandomValues, not Math.random', () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random must not be used');
    };
    try {
      expect(generatePassword().length).toBe(GENERATED_PASSWORD_LENGTH);
    } finally {
      Math.random = original;
    }
  });
});

describe('randomString', () => {
  // With an alphabet of 3, bytes 255 would map to index 0 by modulo, making
  // 'a' a little likelier. 255 is at the limit (255), so it must be redrawn.
  it('throws away the bytes that would bias the result', () => {
    const draws = [[255, 255, 0], [1, 2, 3]];
    let call = 0;
    const fill = (bytes: Uint8Array) => {
      bytes.fill(255);
      const next = draws[Math.min(call++, draws.length - 1)];
      bytes.set(next.slice(0, bytes.length));
    };
    expect(randomString(3, 'abc', fill)).toBe('abc');
  });

  it('spreads its picks evenly over the alphabet', () => {
    const charset = 'abcdefghij';
    const counts = new Map<string, number>();
    for (const c of randomString(100_000, charset)) counts.set(c, (counts.get(c) ?? 0) + 1);
    for (const c of charset) {
      // Expected 10,000 each; ±5% is far outside chance for a fair draw.
      expect(counts.get(c)).toBeGreaterThan(9_500);
      expect(counts.get(c)).toBeLessThan(10_500);
    }
  });

  it('refuses an alphabet it cannot draw from fairly', () => {
    expect(() => randomString(4, '')).toThrow();
  });
});
