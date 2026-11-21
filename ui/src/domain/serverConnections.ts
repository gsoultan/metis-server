/**
 * The servers this one takes releases from and gives them to, and the
 * releases sent between them, kept apart from React so the rules about what
 * a person sees and may do can be tested alone.
 */

/** What a server is for, in the order releases travel. Mirrors entities.ServerPurpose. */
export type ServerPurpose = 'development' | 'staging' | 'production';

/** Which way releases go over a connection, from this server's side. Mirrors entities.ConnectionSide. */
export type ConnectionSide = 'upstream' | 'downstream';

/** This server, as the others see it. Mirrors contracts.ServerIdentity. */
export interface ServerIdentity {
  name: string;
  purpose: ServerPurpose;
  key: string;
  url?: string;
  trust_locked?: boolean;
}

/** Another server releases are exchanged with. Mirrors entities.ServerConnection. */
export interface ServerConnection {
  id: string;
  name: string;
  purpose: ServerPurpose;
  side: ConnectionSide;
  url?: string;
  key: string;
  words: string;
  requested_by: string;
  accepted_by?: string;
  accepted_at?: string;
  last_seen_at?: string;
  created_at: string;
}

/** A one-time code, shown once. Mirrors contracts.IssuedConnectionCode. */
export interface ConnectionCode {
  code: string;
  expires_at: string;
}

/** How far a sent release got on the other server. Mirrors entities.DeliveryState. */
export type DeliveryState = 'waiting' | 'staged' | 'approved' | 'live' | 'superseded' | 'refused';

/** A release sent to another server. Mirrors entities.ReleaseDelivery. */
export interface ReleaseDelivery {
  id: string;
  connection_id: string;
  server_name?: string;
  server_purpose?: ServerPurpose;
  project_id: string;
  release: string;
  state: DeliveryState;
  detail?: string;
  sent_by: string;
  sent_at: string;
  collected_at?: string;
  reported_at?: string;
  last_seen_at?: string;
}

/** One release a check-in handled. Mirrors contracts.CollectedReleaseResult. */
export interface CollectedRelease {
  organization: string;
  project: string;
  release: string;
  state: DeliveryState;
  detail?: string;
}

/** "Development", "Staging" or "Production". */
export function purposeLabel(purpose: ServerPurpose): string {
  return purpose.charAt(0).toUpperCase() + purpose.slice(1);
}

/** The colour a purpose is shown in everywhere. */
export function purposeColor(purpose: ServerPurpose): string {
  switch (purpose) {
    case 'production':
      return 'red';
    case 'staging':
      return 'orange';
    default:
      return 'blue';
  }
}

/** The purposes a server of this purpose takes releases from, nearest first. */
export function takesFrom(purpose: ServerPurpose): ServerPurpose[] {
  switch (purpose) {
    case 'production':
      return ['staging', 'development'];
    case 'staging':
      return ['development'];
    default:
      return [];
  }
}

/** Whether a server of this purpose gives releases to any other. */
export function givesTo(purpose: ServerPurpose): boolean {
  return purpose !== 'production';
}

/** A server this one takes releases from that nobody has accepted yet. */
export function waitingForAcceptance(c: ServerConnection): boolean {
  return c.side === 'upstream' && (c.accepted_at === undefined || c.accepted_at === '');
}

/**
 * Whether this person may accept a connection: a second administrator, never
 * the one who connected it. The server refuses them anyway; this says why
 * before they try.
 */
export function canAccept(c: ServerConnection, username: string | undefined): boolean {
  return waitingForAcceptance(c) && username !== undefined && username !== c.requested_by;
}

/** The four words, as two people read them to each other. */
export function wordsLabel(words: string): string {
  return words.trim().split(/\s+/).join(' · ');
}

/**
 * When a server last checked in, in words. A server that never did says so:
 * nothing is guessed about one that went quiet.
 */
export function lastSeenLabel(at: string | undefined, now: Date): string {
  if (at === undefined || at === '') {
    return 'has not checked in yet';
  }
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 1000));
  if (seconds < 60) {
    return 'checked in just now';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? 'checked in 1 minute ago' : `checked in ${minutes} minutes ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return hours === 1 ? 'checked in 1 hour ago' : `checked in ${hours} hours ago`;
  }
  return `last checked in ${new Date(at).toLocaleDateString()}`;
}

/**
 * Whether a server that should check in every minute has gone quiet: no
 * check-in for five minutes.
 */
export function quiet(at: string | undefined, now: Date): boolean {
  if (at === undefined || at === '') {
    return false;
  }
  return now.getTime() - new Date(at).getTime() > 5 * 60_000;
}

/** How a sent release's state reads, after the server's name. */
export function deliveryStateLabel(state: DeliveryState): string {
  switch (state) {
    case 'waiting':
      return 'waiting to be collected';
    case 'staged':
      return 'staged, waiting for approval';
    case 'approved':
      return 'approved, not live yet';
    case 'live':
      return 'live';
    case 'superseded':
      return 'replaced by a later release';
    case 'refused':
      return 'refused';
  }
}

/** The colour a sent release's state is shown in. */
export function deliveryStateColor(state: DeliveryState): string {
  switch (state) {
    case 'live':
      return 'green';
    case 'refused':
      return 'red';
    case 'waiting':
      return 'gray';
    case 'superseded':
      return 'gray';
    default:
      return 'yellow';
  }
}

/** The servers a release can be sent to: those after this one. */
export function sendTargets(connections: ServerConnection[]): ServerConnection[] {
  return connections.filter((c) => c.side === 'downstream');
}

/** The latest word on each release, by release name, for the release list. */
export function deliveriesByRelease(deliveries: ReleaseDelivery[]): Map<string, ReleaseDelivery[]> {
  const byRelease = new Map<string, ReleaseDelivery[]>();
  for (const d of deliveries) {
    const list = byRelease.get(d.release) ?? [];
    list.push(d);
    byRelease.set(d.release, list);
  }
  return byRelease;
}

/** A code as people type it: letters and digits only, upper case. */
export function normalCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-7]/g, '');
}

/** Whether an address can be tried: http or https, with a host. */
export function plausibleURL(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.host !== '';
  } catch {
    return false;
  }
}
