import { describe, expect, it } from 'bun:test';

import { canRollBack, liveNoteFileName, parseJSONFile, parseKeys, releaseActions, releaseFileName, type Release } from './release';

const base: Release = {
  id: 'r', project_id: 'p', name: 'r1', hash: 'h', origin: 'imported', state: 'staged',
  items: [], connections: [], cut_at: '', cut_by: 'dana', acted_by: 'lee', created_at: '',
};

describe('what a release row offers', () => {
  it('goes live from staged where nothing is protected', () => {
    expect(releaseActions(base, false)).toMatchObject({ approve: false, goLive: true });
  });

  it('is approved by a second person before it goes live in a protected runtime', () => {
    expect(releaseActions(base, true)).toMatchObject({ approve: true, goLive: false });
    expect(releaseActions({ ...base, approved_by: 'kim' }, true)).toMatchObject({ approve: false, goLive: true });
  });

  it('never goes live where it was cut', () => {
    expect(releaseActions({ ...base, origin: 'cut', state: 'cut' }, false)).toMatchObject({ approve: false, goLive: false });
  });

  it('offers nothing once live', () => {
    expect(releaseActions({ ...base, state: 'live', approved_by: 'kim' }, true)).toMatchObject({ approve: false, goLive: false });
  });
});

describe('rolling back', () => {
  it('needs a live release with one before it', () => {
    expect(canRollBack([{ ...base, state: 'live' }])).toBe(false);
    expect(canRollBack([{ ...base, state: 'live', previous: 'r0' }])).toBe(true);
  });
});

describe('typing process keys', () => {
  it('reads a list separated by commas or spaces, each once', () => {
    expect(parseKeys(' claims, onboarding  claims\n')).toEqual(['claims', 'onboarding']);
  });
});

describe('carrying a release between servers', () => {
  it('can always be saved as a file', () => {
    expect(releaseActions({ ...base, origin: 'cut', state: 'cut' }, false).download).toBe(true);
  });

  it('offers its live note once it went live here', () => {
    expect(releaseActions(base, false).downloadLiveNote).toBe(false);
    expect(releaseActions({ ...base, state: 'live', live_at: '2026-11-20T08:00:00Z' }, false).downloadLiveNote).toBe(true);
  });

  it('takes a live note while staged, and only once', () => {
    expect(releaseActions(base, true).attachLiveNote).toBe(true);
    expect(releaseActions({ ...base, origin: 'cut', state: 'cut' }, true).attachLiveNote).toBe(false);
    const note = { format: 'metis.release-live/v1', release: 'r1', hash: 'h', live_at: '', key: 'k', signature: 's' };
    expect(releaseActions({ ...base, live_note: note }, true).attachLiveNote).toBe(false);
  });

  it('names a saved file so it is safe on any disk', () => {
    expect(releaseFileName('2026.11/1 claims')).toBe('2026.11-1-claims.release.json');
    expect(liveNoteFileName('r1')).toBe('r1.live-note.json');
  });

  it('refuses a chosen file that is too large or is not JSON before sending it', () => {
    expect(parseJSONFile('{"a":1}', 7, 10)).toEqual({ value: { a: 1 } });
    expect(parseJSONFile('', 11, 10)).toEqual({ error: 'tooLarge' });
    expect(parseJSONFile('not json', 8, 10)).toEqual({ error: 'notJSON' });
  });
});
