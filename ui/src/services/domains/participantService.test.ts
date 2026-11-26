import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { participantService } from './participantService';

type GlobalWithStorage = typeof globalThis & { localStorage: Pick<Storage, 'getItem'> };

/*
 * Whether a project has anybody in its directory is a question about one row.
 * The list used to be asked for whole, however many thousand people a
 * directory import brought in, every time Help was opened.
 */
describe('listing a project’s participants', () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as GlobalWithStorage).localStorage;
  let requested: string[];

  beforeEach(() => {
    requested = [];
    (globalThis as GlobalWithStorage).localStorage = {
      getItem: () => JSON.stringify({ state: { token: 'token-123' } }),
    };
    globalThis.fetch = (async (input) => {
      requested.push(String(input));
      return new Response(JSON.stringify({ participants: [{ id: 'p1', username: 'ada' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (globalThis as GlobalWithStorage).localStorage = originalLocalStorage;
  });

  it('asks for at most as many as it is told to', async () => {
    await participantService.listParticipants('project-1', undefined, { limit: 1 });
    expect(requested).toHaveLength(1);
    expect(new URL(requested[0], 'http://metis.test').searchParams.get('limit')).toBe('1');
  });

  it('asks for the whole directory when not told otherwise, as the People page does', async () => {
    await participantService.listParticipants('project-1');
    expect(new URL(requested[0], 'http://metis.test').searchParams.has('limit')).toBe(false);
  });
});

/*
 * A file is checked as multipart, with the mapping beside it, so the check and
 * the import read the same columns the same way.
 */
describe('checking a file before it is imported', () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as GlobalWithStorage).localStorage;
  let sent: { url: string; body: FormData } | null;

  beforeEach(() => {
    sent = null;
    (globalThis as GlobalWithStorage).localStorage = {
      getItem: () => JSON.stringify({ state: { token: 'token-123' } }),
    };
    globalThis.fetch = (async (input, init) => {
      sent = { url: String(input), body: init?.body as FormData };
      return new Response(JSON.stringify({ read: 1, counts: { new: 1 }, fields: ['id', 'login'], rows: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (globalThis as GlobalWithStorage).localStorage = originalLocalStorage;
  });

  it('sends the file, the mapping and the rename choice to the check', async () => {
    const file = new File(['id,login\n1,ada\n'], 'people.csv', { type: 'text/csv' });
    const check = await participantService.checkParticipantImport('project-1', {
      kind: 'csv',
      file,
      mapping: { username: 'login', external_id: 'id' },
      move_open_tasks: true,
    });
    expect(check.fields).toEqual(['id', 'login']);
    expect(sent?.url).toEndWith('/participants/import/check');
    expect(sent?.body.get('project_id')).toBe('project-1');
    expect(JSON.parse(String(sent?.body.get('mapping')))).toEqual({ username: 'login', external_id: 'id' });
    expect(sent?.body.get('move_open_tasks')).toBe('true');
  });
});
