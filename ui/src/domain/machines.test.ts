import { describe, expect, it } from 'bun:test';

import { durationLabel, machineStatus, missingWorkWarning, quietFor, roleLabel, type Machine } from './machines';

const now = new Date('2026-11-21T12:00:00Z');

function machine(role: string, secondsAgo: number): Machine {
  return {
    id: `${role}-${secondsAgo}`,
    name: role,
    role,
    started_at: '2026-11-21T10:00:00Z',
    last_seen_at: new Date(now.getTime() - secondsAgo * 1000).toISOString(),
  };
}

describe('a machine’s status', () => {
  it('is running while it keeps saying so', () => {
    expect(machineStatus(machine('web', 10), now)).toBe('running');
    expect(machineStatus(machine('web', 45), now)).toBe('running');
  });

  it('is late after a few heartbeats missed, and stopped after two minutes', () => {
    expect(machineStatus(machine('web', 48), now)).toBe('late');
    expect(machineStatus(machine('web', 120), now)).toBe('stopped');
  });

  it('is reckoned by the server’s clock, never below zero', () => {
    expect(quietFor(machine('web', -5), now)).toBe(0);
  });
});

describe('words', () => {
  it('says how long', () => {
    expect(durationLabel(48)).toBe('48 s');
    expect(durationLabel(300)).toBe('5 min');
    expect(durationLabel(3 * 3600)).toBe('3 h');
    expect(durationLabel(3 * 86400)).toBe('3 days');
  });

  it('says what a role runs', () => {
    expect(roleLabel('web')).toBe('Pages and API');
    expect(roleLabel('worker')).toBe('Background work');
    expect(roleLabel('all')).toBe('Both');
  });
});

describe('warning about missing work', () => {
  it('warns when only web machines are running', () => {
    expect(missingWorkWarning([machine('web', 5), machine('web', 10)], now)).toBe(true);
  });

  it('does not count a worker that stopped', () => {
    expect(missingWorkWarning([machine('web', 5), machine('worker', 600)], now)).toBe(true);
  });

  it('is quiet when something runs the work, or nothing is listed', () => {
    expect(missingWorkWarning([machine('web', 5), machine('worker', 5)], now)).toBe(false);
    expect(missingWorkWarning([machine('all', 5)], now)).toBe(false);
    expect(missingWorkWarning([], now)).toBe(false);
  });
});
