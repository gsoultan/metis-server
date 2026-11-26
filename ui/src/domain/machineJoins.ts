/**
 * Adding a machine to this server with a one-time code, kept apart from React
 * so what the Servers page says about each can be tested alone.
 */

/** What a new machine will run. */
export type MachineRole = 'web' | 'worker' | 'all';

export const MACHINE_ROLES: readonly MachineRole[] = ['web', 'worker', 'all'];

/** A machine being added. Mirrors entities.MachineJoin. */
export interface MachineJoin {
  id: string;
  role: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  /** The machine's host name, once it ran the command. */
  name?: string;
  /** The four words the machine shows too, once it ran the command. */
  words?: string;
  requested_at?: string;
  accepted_by?: string;
  accepted_at?: string;
}

/** A code just made: shown once. Mirrors contracts.IssuedMachineJoin. */
export interface IssuedMachineJoin {
  id: string;
  code: string;
  role: string;
  expires_at: string;
}

/** Where a join is: its code not used yet, its machine waiting, or accepted and collecting. */
export type JoinState = 'code' | 'waiting' | 'accepted';

export function joinState(join: MachineJoin): JoinState {
  if (join.accepted_at) return 'accepted';
  if (join.requested_at) return 'waiting';
  return 'code';
}

/** The machines that ran the command and wait for somebody to press Accept, the oldest first. */
export function waitingJoins(joins: readonly MachineJoin[]): MachineJoin[] {
  return joins
    .filter((j) => joinState(j) === 'waiting')
    .sort((a, b) => (a.requested_at ?? '').localeCompare(b.requested_at ?? ''));
}

/**
 * The one command to run on the new machine. The address is the one this
 * page was opened at, which is the one the machine has to reach too.
 */
export function joinCommand(origin: string, code: string): string {
  return `metis-server join ${origin.replace(/\/+$/, '')} ${code}`;
}

/** Seconds since the machine ran the command, by the server's clock. */
export function waitingFor(join: MachineJoin, serverNow: Date): number {
  if (!join.requested_at) return 0;
  return Math.max(0, Math.round((serverNow.getTime() - new Date(join.requested_at).getTime()) / 1000));
}
