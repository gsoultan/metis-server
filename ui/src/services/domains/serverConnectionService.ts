/**
 * Connecting this server to the ones it takes releases from and gives them
 * to, and sending releases over those connections.
 *
 * Connecting is a platform administrator's; the engine refuses anybody else.
 * Sending a release and reading where it got are release steps like the
 * others.
 */
import type {
  CollectedRelease,
  ConnectionCode,
  ReleaseDelivery,
  ServerConnection,
  ServerIdentity,
} from '../../domain/serverConnections';
import { raiseIfRefused } from '../raise';
import { requestJSON } from '../shared/rest';

interface ListReply {
  server?: ServerIdentity;
  connections?: ServerConnection[];
  err?: string;
}

interface ConnectionReply {
  connection?: ServerConnection;
  err?: string;
}

function connectionOf(reply: ConnectionReply): ServerConnection {
  const c = raiseIfRefused(reply).connection;
  if (c === undefined) {
    throw new Error('The server answered without the connection');
  }
  return c;
}

function connectionPath(id: string): string {
  return `/server-connections/${encodeURIComponent(id)}`;
}

export const serverConnectionService = {
  /** This server and every server it is connected to. */
  async list(signal?: AbortSignal): Promise<{ server: ServerIdentity; connections: ServerConnection[] }> {
    const reply = raiseIfRefused(await requestJSON<ListReply>('/server-connections', { signal }));
    if (reply.server === undefined) {
      throw new Error('The server answered without saying what it is');
    }
    return { server: reply.server, connections: reply.connections ?? [] };
  },

  /** A one-time code for a server after this one to connect with. */
  async makeCode(): Promise<ConnectionCode> {
    const reply = raiseIfRefused(
      await requestJSON<{ code?: ConnectionCode; err?: string }>('/server-connections/codes', { method: 'POST' }),
    );
    if (reply.code === undefined) {
      throw new Error('The server answered without a code');
    }
    return reply.code;
  },

  /** Connects to the server before this one, with a code made there. */
  async connect(url: string, code: string): Promise<ServerConnection> {
    return connectionOf(
      await requestJSON<ConnectionReply>('/server-connections', { method: 'POST', body: { url, code } }),
    );
  },

  /** Trusts a server this one takes releases from. Not by whoever connected it. */
  async accept(id: string): Promise<ServerConnection> {
    return connectionOf(await requestJSON<ConnectionReply>(`${connectionPath(id)}/accept`, { method: 'POST' }));
  },

  async remove(id: string): Promise<void> {
    raiseIfRefused(await requestJSON<{ err?: string }>(connectionPath(id), { method: 'DELETE' }));
  },

  /** Checks in now with a server this one takes releases from. */
  async collectNow(id: string): Promise<CollectedRelease[]> {
    const reply = raiseIfRefused(
      await requestJSON<{ collected?: { releases?: CollectedRelease[] }; err?: string }>(
        `${connectionPath(id)}/collect`,
        { method: 'POST' },
      ),
    );
    return reply.collected?.releases ?? [];
  },

  /** Sends a release to a server after this one, which collects it within a minute. */
  async send(projectId: string, release: string, connectionId: string): Promise<ReleaseDelivery> {
    const reply = raiseIfRefused(
      await requestJSON<{ delivery?: ReleaseDelivery; err?: string }>(
        `/projects/${encodeURIComponent(projectId)}/releases/${encodeURIComponent(release)}/send`,
        { method: 'POST', body: { connection_id: connectionId } },
      ),
    );
    if (reply.delivery === undefined) {
      throw new Error('The server answered without the release sent');
    }
    return reply.delivery;
  },

  /** Where the project's releases were sent, as of each server's last check-in. */
  async deliveries(projectId: string, signal?: AbortSignal): Promise<ReleaseDelivery[]> {
    const reply = raiseIfRefused(
      await requestJSON<{ deliveries?: ReleaseDelivery[]; err?: string }>(
        `/projects/${encodeURIComponent(projectId)}/release-deliveries`,
        { signal },
      ),
    );
    return reply.deliveries ?? [];
  },
};
