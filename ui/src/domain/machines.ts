/**
 * The machines running this server, which share its database, kept apart
 * from React so what the Servers page says about each can be tested alone.
 */

/** One process of this server, as it last said it was. Mirrors entities.Machine. */
export interface Machine {
  id: string;
  name: string;
  address?: string;
  role: string;
  version?: string;
  started_at: string;
  last_seen_at: string;
  /** The role an administrator asked it to take; it starts again in it. */
  requested_role?: string;
  /** Its operator set its role (METIS_ROLE, or no config.yaml): the page cannot change it. */
  role_fixed?: boolean;
}

/** The roles a machine can be switched between, in the order the menu shows them. */
export const MACHINE_ROLES = ['all', 'web', 'worker'] as const;

/** A process says it is running every 15 seconds; three missed is worth showing. */
const RUNNING_WITHIN_SECONDS = 45;
/** After two minutes the server lets a quiet machine be removed. */
const REMOVABLE_AFTER_SECONDS = 120;

export type MachineStatus = 'running' | 'late' | 'stopped';

/** Seconds since the machine last said it was running, by the server's clock. */
export function quietFor(m: Machine, serverNow: Date): number {
  return Math.max(0, Math.round((serverNow.getTime() - new Date(m.last_seen_at).getTime()) / 1000));
}

/** Running, late (a few heartbeats missed) or stopped (removable). */
export function machineStatus(m: Machine, serverNow: Date): MachineStatus {
  const seconds = quietFor(m, serverNow);
  if (seconds <= RUNNING_WITHIN_SECONDS) return 'running';
  if (seconds < REMOVABLE_AFTER_SECONDS) return 'late';
  return 'stopped';
}

/** The colour of the dot beside a machine's status. */
export function statusColor(status: MachineStatus): string {
  switch (status) {
    case 'running':
      return 'green';
    case 'late':
      return 'orange';
    default:
      return 'gray';
  }
}

/** How long, in words: "48 s", "5 min", "3 h", "2 days". */
export function durationLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

/** What a role runs, as the Servers page says it. */
export function roleLabel(role: string): string {
  switch (role) {
    case 'web':
      return 'Pages and API';
    case 'worker':
      return 'Background work';
    case 'all':
      return 'Both';
    default:
      return role;
  }
}

export function roleColor(role: string): string {
  switch (role) {
    case 'web':
      return 'blue';
    case 'worker':
      return 'violet';
    default:
      return 'teal';
  }
}

/**
 * A warning about the set of machines, or null: nothing runs background work,
 * so timers, jobs and deliveries wait. Only machines heard from recently
 * count.
 */
export function missingWorkWarning(machines: Machine[], serverNow: Date): boolean {
  const live = machines.filter((m) => machineStatus(m, serverNow) !== 'stopped');
  return live.length > 0 && !live.some((m) => m.role === 'worker' || m.role === 'all');
}

/** The role a machine runs next: the one it was asked to take, or its own. */
export function nextRole(m: Machine): string {
  return m.requested_role || m.role;
}

/**
 * Whether the Servers page offers to switch this machine, and if not why:
 * its operator fixed its role, or it is not running to hear the ask.
 */
export function roleChange(m: Machine, serverNow: Date): 'open' | 'fixed' | 'quiet' {
  if (m.role_fixed) return 'fixed';
  if (machineStatus(m, serverNow) !== 'running') return 'quiet';
  return 'open';
}

/**
 * Whether switching machine id to role would leave no running machine doing
 * background work. The server refuses it too; the page says so first.
 */
export function leavesNoWorker(machines: Machine[], id: string, role: string, serverNow: Date): boolean {
  if (role !== 'web') return false;
  return !machines.some(
    (m) => m.id !== id && machineStatus(m, serverNow) !== 'stopped' && nextRole(m) !== 'web',
  );
}
