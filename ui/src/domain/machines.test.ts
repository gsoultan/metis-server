import { describe, expect, it } from 'bun:test';

import {
  durationLabel,
  leavesNoWorker,
  machineStatus,
  missingWorkWarning,
  nextRole,
  quietFor,
  roleChange,
  roleLabel,
  type Machine,
} from './machines';

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

describe('switching what a machine runs', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  const at = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();
  const machine = (id: string, role: string, extra: Partial<Machine> = {}): Machine => ({
    id,
    name: id,
    role,
    started_at: at(3600),
    last_seen_at: at(5),
    ...extra,
  });

  it('is offered for a running machine whose role nobody fixed', () => {
    expect(roleChange(machine('a', 'all'), now)).toBe('open');
    expect(roleChange(machine('a', 'all', { role_fixed: true }), now)).toBe('fixed');
    expect(roleChange(machine('a', 'all', { last_seen_at: at(300) }), now)).toBe('quiet');
  });

  it('runs the role it was asked to take next', () => {
    expect(nextRole(machine('a', 'web', { requested_role: 'worker' }))).toBe('worker');
    expect(nextRole(machine('a', 'web'))).toBe('web');
  });

  it('does not offer to switch the last worker to web', () => {
    const machines = [machine('web-1', 'web'), machine('worker-1', 'worker')];
    expect(leavesNoWorker(machines, 'worker-1', 'web', now)).toBe(true);
    expect(leavesNoWorker(machines, 'worker-1', 'all', now)).toBe(false);
    expect(leavesNoWorker(machines, 'web-1', 'worker', now)).toBe(false);
  });

  it('counts a machine already asked to work, and not one that stopped', () => {
    const asked = [machine('web-1', 'web', { requested_role: 'worker' }), machine('worker-1', 'worker')];
    expect(leavesNoWorker(asked, 'worker-1', 'web', now)).toBe(false);
    const stopped = [machine('old', 'worker', { last_seen_at: at(600) }), machine('worker-1', 'worker')];
    expect(leavesNoWorker(stopped, 'worker-1', 'web', now)).toBe(true);
  });
});
