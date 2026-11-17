import { describe, expect, it } from 'bun:test';

import { scheduleNotice } from './startScheduleStatus';

const status = {
  process_key: 'nightly-report',
  scheduled: true,
  paused: false,
  failures: 0,
};

describe('scheduleNotice', () => {
  it('says nothing about a process that does not start on a schedule', () => {
    expect(scheduleNotice(null)).toBeNull();
    expect(scheduleNotice(undefined)).toBeNull();
    expect(scheduleNotice({ ...status, scheduled: false })).toBeNull();
  });

  it('gives the next run of a running schedule', () => {
    const notice = scheduleNotice({ ...status, next_run_at: '2026-11-18T02:00:00Z' });
    expect(notice).toEqual({ state: 'running', nextRun: new Date('2026-11-18T02:00:00Z'), failure: null });
  });

  it('has no next run when the schedule has run out', () => {
    expect(scheduleNotice(status)).toEqual({ state: 'running', nextRun: null, failure: null });
  });

  it('says a schedule is paused and since when, not when it would have run', () => {
    const notice = scheduleNotice({ ...status, paused: true, paused_at: '2026-11-17T09:30:00Z', next_run_at: '2026-11-18T02:00:00Z' });
    expect(notice).toEqual({ state: 'paused', pausedAt: new Date('2026-11-17T09:30:00Z'), failure: null });
  });

  it('still tells of a pause on a process whose schedule is gone', () => {
    expect(scheduleNotice({ ...status, scheduled: false, paused: true })?.state).toBe('paused');
  });

  it('carries the reason a scheduled start is failing', () => {
    expect(scheduleNotice({ ...status, failures: 2, last_error: ' no such group ' })?.failure).toBe('no such group');
    expect(scheduleNotice({ ...status, failures: 1 })?.failure).toBe('The reason was not recorded.');
    expect(scheduleNotice({ ...status, failures: 0, last_error: 'stale' })?.failure).toBeNull();
  });

  it('does not invent a time from one it cannot read', () => {
    expect(scheduleNotice({ ...status, next_run_at: 'soon' })).toEqual({ state: 'running', nextRun: null, failure: null });
  });
});
