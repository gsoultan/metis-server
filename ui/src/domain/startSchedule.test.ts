import { describe, expect, it } from 'bun:test';

import {
  defaultSchedule,
  describeSchedule,
  formatRun,
  nextRun,
  nextRuns,
  readSchedule,
  scheduleProblems,
  tidySchedule,
  type StartSchedule,
} from './startSchedule';

const at = (iso: string) => new Date(iso);
const next = (schedule: StartSchedule, after: string) => nextRun(schedule, at(after))?.toISOString();
const utc = (iso: string) => at(iso).toISOString();

describe('the next run of a schedule', () => {
  // The engine's own cases (entities/start_schedule_test.go): the panel must
  // name the times the engine will run at.
  const cases: [string, StartSchedule, string, string][] = [
    ['every day, later today',
      { every: 'day', at: '09:00', time_zone: 'Asia/Jakarta' },
      '2026-11-16T08:00:00+07:00', '2026-11-16T09:00:00+07:00'],
    ['every day, exactly at the time, is tomorrow',
      { every: 'day', at: '09:00', time_zone: 'Asia/Jakarta' },
      '2026-11-16T09:00:00+07:00', '2026-11-17T09:00:00+07:00'],
    ['every weekday skips the weekend',
      { every: 'weekday', at: '09:00', time_zone: 'Asia/Jakarta' },
      '2026-11-13T10:00:00+07:00', '2026-11-16T09:00:00+07:00'],
    ['every week on the days named',
      { every: 'week', days: ['mon', 'wed'], at: '09:00', time_zone: 'Asia/Jakarta' },
      '2026-11-16T10:00:00+07:00', '2026-11-18T09:00:00+07:00'],
    ['every month on a day',
      { every: 'month', day_of_month: 1, at: '00:30', time_zone: 'UTC' },
      '2026-11-16T00:00:00Z', '2026-12-01T00:30:00Z'],
    ['day 31 in a 30-day month is its last day',
      { every: 'month', day_of_month: 31, at: '09:00', time_zone: 'UTC' },
      '2026-11-01T00:00:00Z', '2026-11-30T09:00:00Z'],
    ['day 31 in February of a leap year',
      { every: 'month', day_of_month: 31, at: '09:00', time_zone: 'UTC' },
      '2028-02-01T00:00:00Z', '2028-02-29T09:00:00Z'],
    ['the zone decides the day: 09:00 in Jakarta is 02:00 UTC',
      { every: 'day', at: '09:00', time_zone: 'Asia/Jakarta' },
      '2026-11-16T01:00:00Z', '2026-11-16T02:00:00Z'],
    ['an interval keeps to its beat, not to when it was asked',
      { every: 'interval', interval_minutes: 15, time_zone: 'UTC' },
      '2026-11-16T10:07:31Z', '2026-11-16T10:15:00Z'],
    ['an interval on the beat moves to the next one',
      { every: 'interval', interval_minutes: 120, time_zone: 'UTC' },
      '2026-11-16T10:00:00Z', '2026-11-16T12:00:00Z'],
    ['nothing runs before the first date',
      { every: 'day', at: '09:00', time_zone: 'UTC', from: '2026-12-01' },
      '2026-11-16T10:00:00Z', '2026-12-01T09:00:00Z'],
    ["an interval starts at the first date's midnight",
      { every: 'interval', interval_minutes: 90, time_zone: 'UTC', from: '2026-12-01' },
      '2026-11-16T10:00:00Z', '2026-12-01T00:00:00Z'],
    ['the last date is included',
      { every: 'day', at: '23:00', time_zone: 'UTC', until: '2026-11-16' },
      '2026-11-16T10:00:00Z', '2026-11-16T23:00:00Z'],
  ];
  it.each(cases)('%s', (_name, schedule, after, want) => {
    expect(next(schedule, after)).toBe(utc(want));
  });

  it('has none after its last date', () => {
    expect(next({ every: 'day', at: '09:00', time_zone: 'UTC', until: '2026-11-16' }, '2026-11-16T23:30:00Z')).toBeUndefined();
    expect(next({ every: 'interval', interval_minutes: 60, time_zone: 'UTC', until: '2026-11-16' }, '2026-11-16T23:30:00Z')).toBeUndefined();
  });

  it('runs a time the clocks skip at the next minute that exists', () => {
    const schedule: StartSchedule = { every: 'day', at: '02:30', time_zone: 'America/New_York' };
    const first = nextRun(schedule, at('2026-03-07T12:00:00-05:00'));
    expect(first?.toISOString()).toBe(utc('2026-03-08T03:00:00-04:00'));
    expect(nextRun(schedule, first!)?.toISOString()).toBe(utc('2026-03-09T02:30:00-04:00'));
  });

  it('runs a time that happens twice once, the first time', () => {
    const schedule: StartSchedule = { every: 'day', at: '01:30', time_zone: 'America/New_York' };
    const first = nextRun(schedule, at('2026-10-31T12:00:00-04:00'));
    expect(first?.toISOString()).toBe(utc('2026-11-01T01:30:00-04:00'));
    expect(nextRun(schedule, first!)?.toISOString()).toBe(utc('2026-11-02T01:30:00-05:00'));
  });

  it('only moves forward, across a year of every kind of zone change', () => {
    const schedules: StartSchedule[] = [
      { every: 'day', at: '02:30', time_zone: 'America/New_York' },
      { every: 'weekday', at: '01:30', time_zone: 'Europe/London' },
      { every: 'month', day_of_month: 31, at: '23:59', time_zone: 'Australia/Lord_Howe' },
      { every: 'interval', interval_minutes: 1440, time_zone: 'America/New_York' },
    ];
    for (const schedule of schedules) {
      const runs = nextRuns(schedule, at('2026-01-01T00:00:00Z'), 400);
      expect(runs.length).toBeGreaterThan(11);
      for (let i = 1; i < runs.length; i++) {
        expect(runs[i].getTime()).toBeGreaterThan(runs[i - 1].getTime());
      }
    }
  });

  it('lists the next few, and stops where the schedule does', () => {
    const schedule: StartSchedule = { every: 'day', at: '09:00', time_zone: 'UTC', until: '2026-11-17' };
    expect(nextRuns(schedule, at('2026-11-16T00:00:00Z'), 3).map((run) => run.toISOString())).toEqual([
      '2026-11-16T09:00:00.000Z',
      '2026-11-17T09:00:00.000Z',
    ]);
  });
});

describe('a schedule that cannot run', () => {
  const cases: [string, Partial<StartSchedule>, string][] = [
    ['no rule', { time_zone: 'UTC' }, 'how often'],
    ['an unknown rule', { every: 'fortnight' as never, time_zone: 'UTC' }, 'how often'],
    ['no zone', { every: 'day', at: '09:00' }, 'time zone'],
    ["the server's own zone", { every: 'day', at: '09:00', time_zone: 'Local' }, 'time zone'],
    ['an unknown zone', { every: 'day', at: '09:00', time_zone: 'Mars/Olympus' }, 'time zone'],
    ['an interval of nothing', { every: 'interval', interval_minutes: 0, time_zone: 'UTC' }, 'from 1 minute'],
    ['an interval past a year', { every: 'interval', interval_minutes: 9_999_999, time_zone: 'UTC' }, 'one year'],
    ['no time of day', { every: 'day', time_zone: 'UTC' }, 'time of day'],
    ['a time that is not one', { every: 'day', at: '25:00', time_zone: 'UTC' }, 'time of day'],
    ['a week with no day', { every: 'week', at: '09:00', time_zone: 'UTC' }, 'at least one day'],
    ['a day that is not one', { every: 'week', days: ['funday' as never], at: '09:00', time_zone: 'UTC' }, 'Monday to Sunday'],
    ['day 0 of the month', { every: 'month', day_of_month: 0, at: '09:00', time_zone: 'UTC' }, '1 to 31'],
    ['day 32 of the month', { every: 'month', day_of_month: 32, at: '09:00', time_zone: 'UTC' }, '1 to 31'],
    ['a first date that is not one', { every: 'day', at: '09:00', time_zone: 'UTC', from: 'tomorrow' }, 'first date'],
    ['a date that does not exist', { every: 'day', at: '09:00', time_zone: 'UTC', until: '2026-02-31' }, 'last date'],
    ['a last date before the first', { every: 'day', at: '09:00', time_zone: 'UTC', from: '2026-12-02', until: '2026-12-01' }, 'before the first'],
  ];
  it.each(cases)('%s is named, and has no next run', (_name, schedule, reason) => {
    const problems = scheduleProblems(schedule as StartSchedule);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(reason);
    expect(nextRun(schedule as StartSchedule, at('2026-11-16T00:00:00Z'))).toBeUndefined();
  });

  it('says nothing about one that can', () => {
    expect(scheduleProblems(defaultSchedule('Asia/Jakarta'))).toEqual([]);
  });
});

describe('reading and writing a schedule', () => {
  it('reads one held as an object or as text, and nothing else', () => {
    const schedule = { every: 'day', at: '09:00', time_zone: 'UTC' };
    expect(readSchedule(schedule)).toEqual(schedule);
    expect(readSchedule(JSON.stringify(schedule))).toEqual(schedule);
    expect(readSchedule(undefined)).toBeUndefined();
    expect(readSchedule('')).toBeUndefined();
    expect(readSchedule('0 9 * * *')).toBeUndefined();
    expect(readSchedule([])).toBeUndefined();
  });

  it('keeps only the fields its rule reads', () => {
    const weekly: StartSchedule = { every: 'week', days: ['fri'], at: '17:00', time_zone: 'UTC', from: '2026-12-01' };
    expect(tidySchedule({ ...weekly, every: 'day' })).toEqual({ every: 'day', at: '17:00', time_zone: 'UTC', from: '2026-12-01' });
    expect(tidySchedule({ ...weekly, every: 'interval' })).toEqual({ every: 'interval', interval_minutes: 60, time_zone: 'UTC', from: '2026-12-01' });
    expect(tidySchedule({ every: 'month', time_zone: 'UTC' })).toEqual({ every: 'month', at: '09:00', day_of_month: 1, time_zone: 'UTC' });
  });
});

describe('a schedule in words', () => {
  it.each<[StartSchedule, string]>([
    [{ every: 'weekday', at: '09:00', time_zone: 'Asia/Jakarta' }, 'Every weekday at 09:00 (Asia/Jakarta)'],
    [{ every: 'day', at: '18:30', time_zone: 'UTC' }, 'Every day at 18:30 (UTC)'],
    [{ every: 'week', days: ['wed', 'mon'], at: '09:00', time_zone: 'UTC' }, 'Every Mon, Wed at 09:00 (UTC)'],
    [{ every: 'month', day_of_month: 1, at: '09:00', time_zone: 'UTC' }, 'Every month on the 1st at 09:00 (UTC)'],
    [{ every: 'month', day_of_month: 31, at: '09:00', time_zone: 'UTC' }, 'Every month on the 31st, or the last day of a shorter month, at 09:00 (UTC)'],
    [{ every: 'interval', interval_minutes: 15, time_zone: 'UTC' }, 'Every 15 minutes (UTC)'],
    [{ every: 'interval', interval_minutes: 60, time_zone: 'UTC' }, 'Every hour (UTC)'],
    [{ every: 'interval', interval_minutes: 90, time_zone: 'UTC' }, 'Every hour 30 minutes (UTC)'],
    [{ every: 'interval', interval_minutes: 2880, time_zone: 'UTC' }, 'Every 2 days (UTC)'],
    [{ every: 'day', at: '09:00', time_zone: 'UTC', from: '2026-12-01', until: '2026-12-31' }, 'Every day at 09:00 (UTC) from 2026-12-01 until 2026-12-31'],
  ])('%j', (schedule, words) => {
    expect(describeSchedule(schedule)).toBe(words);
  });

  it('says a broken one is broken', () => {
    expect(describeSchedule({ every: 'day', time_zone: 'UTC' })).toBe('A schedule that cannot run as written');
  });

  it("shows a run time on the schedule's own clock", () => {
    expect(formatRun(at('2026-11-16T02:00:00Z'), 'Asia/Jakarta')).toBe('Mon, 16 Nov 2026, 09:00');
  });
});
