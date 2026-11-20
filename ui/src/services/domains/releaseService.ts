/**
 * A project's releases, in the environment the page is served from.
 *
 * Every call goes to the port the page came from, so "go live" here means
 * live in this environment, and nothing the browser sends can name another.
 */
import type { Release, RuntimeOverview } from '../../domain/release';
import { requestJSON } from '../shared/rest';

function releasesPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/releases`;
}

function releasePath(projectId: string, name: string): string {
  return `${releasesPath(projectId)}/${encodeURIComponent(name)}`;
}

async function one(path: string, body?: unknown): Promise<Release> {
  const reply = await requestJSON<{ release: Release }>(path, { method: 'POST', body });
  return reply.release;
}

export const releaseService = {
  async list(projectId: string, signal?: AbortSignal): Promise<Release[]> {
    const reply = await requestJSON<{ releases?: Release[] }>(releasesPath(projectId), { signal });
    return reply.releases ?? [];
  },

  /** Which runtime this page is served from, and the project's environments by name. */
  async runtime(projectId: string, signal?: AbortSignal): Promise<RuntimeOverview> {
    const reply = await requestJSON<Partial<RuntimeOverview>>(
      `/environments/current?project_id=${encodeURIComponent(projectId)}`,
      { signal },
    );
    return {
      current: reply.current ?? { id: '', name: '', protected: false },
      environments: reply.environments ?? [],
    };
  },

  cut(projectId: string, name: string, processes: string[], decisions: string[]): Promise<Release> {
    return one(releasesPath(projectId), { name, processes, decisions });
  },

  /** An empty environment is the installation's own runtime. */
  importFrom(projectId: string, fromEnvironment: string, name: string): Promise<Release> {
    return one(`${releasesPath(projectId)}/import`, { from_environment: fromEnvironment, name });
  },

  approve(projectId: string, name: string): Promise<Release> {
    return one(`${releasePath(projectId, name)}/approve`);
  },

  goLive(projectId: string, name: string): Promise<Release> {
    return one(`${releasePath(projectId, name)}/go-live`);
  },

  /** A release imported from a signed file carried from another server. */
  importFile(projectId: string, file: unknown): Promise<Release> {
    return one(`${releasesPath(projectId)}/import-file`, { file });
  },

  /** The release as a signed file, to carry where this server cannot reach. */
  async exportFile(projectId: string, name: string): Promise<unknown> {
    const reply = await requestJSON<{ file?: unknown }>(`${releasePath(projectId, name)}/export`);
    return reply.file;
  },

  /** This environment's signed note that the release went live here. */
  async liveNote(projectId: string, name: string): Promise<unknown> {
    const reply = await requestJSON<{ note?: unknown }>(`${releasePath(projectId, name)}/live-note`);
    return reply.note;
  },

  /** The note that the release went live in the environment before this one. */
  attachLiveNote(projectId: string, name: string, note: unknown): Promise<Release> {
    return one(`${releasePath(projectId, name)}/live-note`, { note });
  },

  rollBack(projectId: string): Promise<Release> {
    return one(`${releasesPath(projectId)}/rollback`);
  },
};
