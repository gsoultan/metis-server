import { describe, expect, test } from 'bun:test';

import { joinCommand, joinState, waitingFor, waitingJoins, type MachineJoin } from './machineJoins';

const join = (over: Partial<MachineJoin>): MachineJoin => ({
  id: 'j',
  role: 'worker',
  created_by: 'ana',
  created_at: '2026-11-23T10:00:00Z',
  expires_at: '2026-11-23T11:00:00Z',
  ...over,
});

describe('a machine being added', () => {
  test('is a code until the machine runs the command, then waits, then is accepted', () => {
    expect(joinState(join({}))).toBe('code');
    expect(joinState(join({ requested_at: '2026-11-23T10:05:00Z' }))).toBe('waiting');
    expect(joinState(join({ requested_at: '2026-11-23T10:05:00Z', accepted_at: '2026-11-23T10:06:00Z' }))).toBe('accepted');
  });

  test('only the machines waiting are offered for Accept, the oldest first', () => {
    const later = join({ id: 'later', requested_at: '2026-11-23T10:09:00Z' });
    const sooner = join({ id: 'sooner', requested_at: '2026-11-23T10:02:00Z' });
    const unused = join({ id: 'unused' });
    const done = join({ id: 'done', requested_at: '2026-11-23T10:01:00Z', accepted_at: '2026-11-23T10:03:00Z' });
    expect(waitingJoins([later, unused, done, sooner]).map((j) => j.id)).toEqual(['sooner', 'later']);
  });

  test('the command names the address the page is reached at, without a trailing slash', () => {
    expect(joinCommand('https://metis.example.co/', 'MTS-J8WQ-77HD')).toBe('metis-server join https://metis.example.co MTS-J8WQ-77HD');
  });

  test('how long a machine has waited is reckoned by the server clock', () => {
    const now = new Date('2026-11-23T10:06:00Z');
    expect(waitingFor(join({ requested_at: '2026-11-23T10:05:00Z' }), now)).toBe(60);
    expect(waitingFor(join({}), now)).toBe(0);
  });
});
