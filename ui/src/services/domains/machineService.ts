/**
 * The machines running this server. A platform administrator's; the engine
 * refuses anybody else.
 */
import type { IssuedMachineJoin, MachineJoin, MachineRole } from '../../domain/machineJoins';
import type { Machine } from '../../domain/machines';
import { raiseIfRefused } from '../raise';
import { requestJSON } from '../shared/rest';

export const machineService = {
  /** Every machine, the most recently heard first, and the server's own time. */
  async list(signal?: AbortSignal): Promise<{ machines: Machine[]; now: Date }> {
    const reply = raiseIfRefused(
      await requestJSON<{ machines?: Machine[]; now?: string; err?: string }>('/machines', { signal }),
    );
    return { machines: reply.machines ?? [], now: reply.now ? new Date(reply.now) : new Date() };
  },

  /** Removes a machine that stopped saying it was running. */
  async forget(id: string): Promise<void> {
    raiseIfRefused(await requestJSON<{ err?: string }>(`/machines/${encodeURIComponent(id)}`, { method: 'DELETE' }));
  },

  /** Asks running machine id to start again in role. */
  async changeRole(id: string, role: string): Promise<void> {
    raiseIfRefused(
      await requestJSON<{ err?: string }>(`/machines/${encodeURIComponent(id)}/role`, {
        method: 'POST',
        body: JSON.stringify({ role }),
      }),
    );
  },

  /** The machines being added that have not finished, and the server's own time. */
  async listJoins(signal?: AbortSignal): Promise<{ joins: MachineJoin[]; now: Date }> {
    const reply = raiseIfRefused(
      await requestJSON<{ joins?: MachineJoin[]; now?: string; err?: string }>('/machines/joins', { signal }),
    );
    return { joins: reply.joins ?? [], now: reply.now ? new Date(reply.now) : new Date() };
  },

  /** A one-time code for a new machine that runs role. Shown once. */
  async makeJoin(role: MachineRole): Promise<IssuedMachineJoin> {
    return raiseIfRefused(
      await requestJSON<IssuedMachineJoin & { err?: string }>('/machines/joins', {
        method: 'POST',
        body: JSON.stringify({ role }),
      }),
    );
  },

  /** Hands this server's settings to the machine waiting on join id, sealed to its key. */
  async acceptJoin(id: string): Promise<void> {
    raiseIfRefused(
      await requestJSON<{ err?: string }>(`/machines/joins/${encodeURIComponent(id)}/accept`, { method: 'POST' }),
    );
  },

  /** Refuses the machine waiting on join id, or takes back a code nobody used. */
  async removeJoin(id: string): Promise<void> {
    raiseIfRefused(
      await requestJSON<{ err?: string }>(`/machines/joins/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    );
  },
};
