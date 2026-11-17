/**
 * When a process starts by itself: the rule a start step's "On a schedule"
 * choice is saved as, under `start_schedule`.
 *
 * The engine owns the rule (entities/start_schedule.go in gsoultan/metis):
 * it checks one at deploy and works out each run time from it. What is here
 * is the same rule read in the browser, so the panel can say what is wrong
 * before a deploy is refused, and show the next run times before anybody
 * waits for one. Where the two could disagree the engine is right, which is
 * why the tests here use the engine's own cases.
 */

export type ScheduleEvery = 'interval' | 'day' | 'weekday' | 'week' | 'month';

export type ScheduleDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** The schedule as the engine stores it. */
export interface StartSchedule {
  every: ScheduleEvery;
  interval_minutes?: number;
  /** Wall-clock time, "09:00", for every rule but the interval. */
  at?: string;
  days?: ScheduleDay[];
  /** A month too short for it runs on its last day. */
  day_of_month?: number;
  /** IANA zone the times are read in. */
  time_zone: string;
  /** Optional first and last dates, "2026-01-31", both inclusive. */
  from?: string;
  until?: string;
}

export const SCHEDULE_DAYS: readonly { value: ScheduleDay; label: string; short: string }[] = [
  { value: 'mon', label: 'Monday', short: 'Mon' },
  { value: 'tue', label: 'Tuesday', short: 'Tue' },
  { value: 'wed', label: 'Wednesday', short: 'Wed' },
  { value: 'thu', label: 'Thursday', short: 'Thu' },
  { value: 'fri', label: 'Friday', short: 'Fri' },
  { value: 'sat', label: 'Saturday', short: 'Sat' },
  { value: 'sun', label: 'Sunday', short: 'Sun' },
];

/** The engine's bounds on "every N minutes". */
export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 366 * 24 * 60;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Every rule matches at least once a month, so two months always finds one. */
const SEARCH_DAYS = 62;
/** The longest wall-clock skip on record is a day. */
const GAP_MINUTES = 25 * 60;
/** JS weekday numbers, Sunday first, as the rule's day names. */
const DAY_BY_NUMBER: readonly ScheduleDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** The zone this browser is set to, which is the person's own. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Whether the browser knows a zone by this name. */
export function isTimeZone(zone: string): boolean {
  if (zone.trim() === '' || zone === 'Local') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Every zone the browser can name, for the picker; the person's own first. */
export function timeZoneChoices(own: string = browserTimeZone()): string[] {
  const supported =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([own, 'UTC', ...supported])];
}

/** What "On a schedule" starts as: every weekday at nine, in the person's zone. */
export function defaultSchedule(timeZone: string = browserTimeZone()): StartSchedule {
  return { every: 'weekday', at: '09:00', time_zone: timeZone };
}

/**
 * A step's schedule as the panel holds it, or undefined when it has none or
 * what is there is not a schedule at all. A draft or an imported model can
 * hold it as text.
 */
export function readSchedule(raw: unknown): StartSchedule | undefined {
  let value = raw;
  if (typeof value === 'string') {
    if (value.trim() === '') return undefined;
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const fields = value as Record<string, unknown>;
  if (typeof fields.every !== 'string') return undefined;
  return value as StartSchedule;
}

/**
 * The schedule with only the fields its rule reads, so switching from weekly
 * to daily does not leave days behind for a later reader to wonder about.
 */
export function tidySchedule(schedule: StartSchedule): StartSchedule {
  const out: StartSchedule = { every: schedule.every, time_zone: schedule.time_zone };
  if (schedule.every === 'interval') {
    out.interval_minutes = schedule.interval_minutes ?? 60;
  } else {
    out.at = schedule.at ?? '09:00';
  }
  if (schedule.every === 'week') out.days = schedule.days ?? ['mon'];
  if (schedule.every === 'month') out.day_of_month = schedule.day_of_month ?? 1;
  if (schedule.from) out.from = schedule.from;
  if (schedule.until) out.until = schedule.until;
  return out;
}

interface Resolved {
  schedule: StartSchedule;
  hour: number;
  minute: number;
  /** First instant of the first date, and first instant after the last. */
  from?: number;
  until?: number;
}

/**
 * What is wrong with a schedule, in the order the engine checks, or an empty
 * list. Each message says what to change.
 */
export function scheduleProblems(schedule: StartSchedule): string[] {
  const result = resolve(schedule);
  return 'problem' in result ? [result.problem] : [];
}

function resolve(schedule: StartSchedule): Resolved | { problem: string } {
  if (!isTimeZone(schedule.time_zone ?? '')) {
    return { problem: 'Choose a time zone, such as Asia/Jakarta or UTC.' };
  }
  const resolved: Resolved = { schedule, hour: 0, minute: 0 };

  switch (schedule.every) {
    case 'interval': {
      const minutes = schedule.interval_minutes ?? 0;
      if (!Number.isInteger(minutes) || minutes < MIN_INTERVAL_MINUTES || minutes > MAX_INTERVAL_MINUTES) {
        return { problem: 'Say how often it runs: a whole number of minutes, from 1 minute to one year.' };
      }
      break;
    }
    case 'week': {
      const days = schedule.days ?? [];
      if (days.length === 0) return { problem: 'Choose at least one day of the week.' };
      if (days.some((day) => !DAY_BY_NUMBER.includes(day))) {
        return { problem: 'A day of the week is not one of Monday to Sunday.' };
      }
      break;
    }
    case 'month': {
      const day = schedule.day_of_month ?? 0;
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        return { problem: 'Choose a day of the month from 1 to 31.' };
      }
      break;
    }
    case 'day':
    case 'weekday':
      break;
    default:
      return { problem: 'Choose how often it runs.' };
  }

  if (schedule.every !== 'interval') {
    const at = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((schedule.at ?? '').trim());
    if (!at) return { problem: 'Give a time of day, such as 09:00.' };
    resolved.hour = Number(at[1]);
    resolved.minute = Number(at[2]);
  }

  if (schedule.from) {
    const from = dateParts(schedule.from);
    if (!from) return { problem: 'The first date is not a date, such as 2026-01-31.' };
    resolved.from = wallClock(from.year, from.month, from.day, 0, 0, schedule.time_zone);
  }
  if (schedule.until) {
    const until = dateParts(schedule.until);
    if (!until) return { problem: 'The last date is not a date, such as 2026-01-31.' };
    // Inclusive: the whole of the last day counts.
    resolved.until = wallClock(until.year, until.month, until.day + 1, 0, 0, schedule.time_zone);
    if (resolved.from !== undefined && resolved.until <= resolved.from) {
      return { problem: 'The last date is before the first date.' };
    }
  }
  return resolved;
}

/**
 * The first time after `after` that the schedule starts a run, or undefined
 * when there is none: it cannot run as written, or its last date has passed.
 */
export function nextRun(schedule: StartSchedule, after: Date): Date | undefined {
  const resolved = resolve(schedule);
  if ('problem' in resolved) return undefined;
  const next = nextAfter(resolved, after.getTime());
  return next === undefined ? undefined : new Date(next);
}

/** The next `count` run times after `after`, fewer when the schedule ends. */
export function nextRuns(schedule: StartSchedule, after: Date, count: number): Date[] {
  const resolved = resolve(schedule);
  if ('problem' in resolved) return [];
  const runs: Date[] = [];
  let cursor = after.getTime();
  while (runs.length < count) {
    const next = nextAfter(resolved, cursor);
    if (next === undefined) break;
    runs.push(new Date(next));
    cursor = next;
  }
  return runs;
}

function nextAfter(resolved: Resolved, afterMs: number): number | undefined {
  let after = afterMs;
  // Everything before the first date is skipped; the first date's own
  // midnight is itself a candidate.
  if (resolved.from !== undefined && after < resolved.from) after = resolved.from - 1;
  const next =
    resolved.schedule.every === 'interval' ? nextInterval(resolved, after) : nextDaily(resolved, after);
  if (next === undefined) return undefined;
  if (resolved.until !== undefined && next >= resolved.until) return undefined;
  return next;
}

/**
 * Whole intervals counted from a fixed anchor, so the times do not drift with
 * when each run happened to start.
 */
function nextInterval(resolved: Resolved, after: number): number {
  const anchor = resolved.from ?? wallClock(2000, 1, 1, 0, 0, resolved.schedule.time_zone);
  const step = (resolved.schedule.interval_minutes ?? 1) * MINUTE;
  if (after < anchor) return anchor;
  return anchor + (Math.floor((after - anchor) / step) + 1) * step;
}

function nextDaily(resolved: Resolved, after: number): number | undefined {
  const zone = resolved.schedule.time_zone;
  const start = wallParts(after, zone);
  for (let offset = 0; offset < SEARCH_DAYS; offset++) {
    // The date alone, carried as UTC so a day's step is always a day.
    const date = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
    if (!runsOn(resolved.schedule, date)) continue;
    const candidate = wallClock(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      resolved.hour,
      resolved.minute,
      zone,
    );
    if (candidate > after) return candidate;
  }
  return undefined;
}

/** Whether the rule picks this date, given as a UTC midnight. */
function runsOn(schedule: StartSchedule, date: Date): boolean {
  const weekday = DAY_BY_NUMBER[date.getUTCDay()];
  switch (schedule.every) {
    case 'day':
      return true;
    case 'weekday':
      return weekday !== 'sat' && weekday !== 'sun';
    case 'week':
      return (schedule.days ?? []).includes(weekday);
    case 'month': {
      // Day 0 of next month is the last day of this one.
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      return date.getUTCDate() === Math.min(schedule.day_of_month ?? 1, lastDay);
    }
    default:
      return false;
  }
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** What a clock in `zone` reads at an instant. */
function wallParts(instant: number, zone: string): WallParts {
  let format = formatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
    formatters.set(zone, format);
  }
  const read: Record<string, number> = {};
  for (const part of format.formatToParts(new Date(instant))) {
    if (part.type !== 'literal') read[part.type] = Number(part.value);
  }
  return { year: read.year, month: read.month, day: read.day, hour: read.hour, minute: read.minute };
}

/** How far ahead of UTC a clock in `zone` is at an instant, in milliseconds. */
function zoneOffset(instant: number, zone: string): number {
  const wall = wallParts(instant, zone);
  const asUTC = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  return asUTC - Math.floor(instant / MINUTE) * MINUTE;
}

/**
 * The instant a clock in `zone` reads the given date and time.
 *
 * Two days a year a zone with daylight saving has no single answer. A time
 * that happens twice (clocks go back) is the first of the two, so the run
 * starts once. A time that never happens (clocks go forward) is the next
 * minute that does, so the run is late by the size of the skip.
 */
function wallClock(year: number, month: number, day: number, hour: number, minute: number, zone: string): number {
  for (let skipped = 0; skipped < GAP_MINUTES; skipped++) {
    const reading = earliestReading(year, month, day, hour, minute + skipped, zone);
    if (reading !== undefined) return reading;
  }
  return Date.UTC(year, month - 1, day, hour, minute);
}

/** The first instant a clock in `zone` shows the wall time, if it ever does. */
function earliestReading(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  zone: string,
): number | undefined {
  // The wall time as if it were UTC, which normalises overflow too.
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let earliest: number | undefined;
  // The zone's offset a day either side covers both sides of any change
  // near this time.
  for (const probe of [naive - DAY, naive + DAY]) {
    const candidate = naive - zoneOffset(probe, zone);
    const wall = wallParts(candidate, zone);
    if (Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) !== naive) continue;
    if (earliest === undefined || candidate < earliest) earliest = candidate;
  }
  return earliest;
}

function dateParts(text: string): { year: number; month: number; day: number } | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  // 2026-02-31 parses as a number triple and is not a date.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return undefined;
  }
  return { year, month, day };
}

/** A run time in the schedule's own zone: "Mon, 16 Nov 2026, 09:00". */
export function formatRun(run: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(run);
}

/** "every 90 minutes" as people say it: "every 1 hour 30 minutes". */
function describeInterval(minutes: number): string {
  if (minutes % (24 * 60) === 0) return plural(minutes / (24 * 60), 'day');
  if (minutes % 60 === 0) return plural(minutes / 60, 'hour');
  if (minutes > 60) return `${plural(Math.floor(minutes / 60), 'hour')} ${plural(minutes % 60, 'minute')}`;
  return plural(minutes, 'minute');
}

function plural(count: number, unit: string): string {
  return count === 1 ? unit : `${count} ${unit}s`;
}

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th';
  return `${day}${suffix}`;
}

/** The schedule in a sentence: "Every weekday at 09:00 (Asia/Jakarta)". */
export function describeSchedule(schedule: StartSchedule): string {
  if (scheduleProblems(schedule).length > 0) return 'A schedule that cannot run as written';
  const zone = `(${schedule.time_zone})`;
  let rule: string;
  switch (schedule.every) {
    case 'interval':
      rule = `Every ${describeInterval(schedule.interval_minutes ?? 0)}`;
      break;
    case 'day':
      rule = `Every day at ${schedule.at}`;
      break;
    case 'weekday':
      rule = `Every weekday at ${schedule.at}`;
      break;
    case 'week': {
      const chosen = SCHEDULE_DAYS.filter((day) => (schedule.days ?? []).includes(day.value));
      rule = `Every ${chosen.map((day) => day.short).join(', ')} at ${schedule.at}`;
      break;
    }
    default: {
      const day = schedule.day_of_month ?? 1;
      const which = day >= 29 ? `${ordinal(day)}, or the last day of a shorter month,` : ordinal(day);
      rule = `Every month on the ${which} at ${schedule.at}`;
    }
  }
  const window = [
    schedule.from ? `from ${schedule.from}` : '',
    schedule.until ? `until ${schedule.until}` : '',
  ].filter(Boolean);
  return [rule, zone, ...window].join(' ');
}
