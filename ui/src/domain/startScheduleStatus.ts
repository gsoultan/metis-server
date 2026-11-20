import type { ApiStartScheduleStatus } from '../services/types';

/**
 * What to tell a person about a process's scheduled starts.
 *
 * `running` with no `nextRun` is a schedule that has run out: its last date
 * has passed and nothing more is to come.
 */
export type ScheduleNotice =
  | { state: 'running'; nextRun: Date | null; failure: string | null }
  | { state: 'paused'; pausedAt: Date | null; failure: string | null };

/**
 * Reads the engine's status into a notice, or null when the process does not
 * start on a schedule and there is nothing to say.
 *
 * A pause is told even for a process that no longer has a schedule: it still
 * holds, and would stop the next version that brings one.
 */
export function scheduleNotice(status: ApiStartScheduleStatus | null | undefined): ScheduleNotice | null {
  if (!status || (!status.scheduled && !status.paused)) return null;
  const failure = status.failures > 0 ? (status.last_error?.trim() || 'The reason was not recorded.') : null;
  if (status.paused) {
    return { state: 'paused', pausedAt: readTime(status.paused_at), failure };
  }
  return { state: 'running', nextRun: readTime(status.next_run_at), failure };
}

function readTime(value: string | undefined): Date | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}
