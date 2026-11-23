/**
 * The machines running this server. A platform administrator's; the engine
 * refuses anybody else.
 */
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
};
