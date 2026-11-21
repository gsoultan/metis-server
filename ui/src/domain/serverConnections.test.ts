import { describe, expect, it } from 'bun:test';

import {
  canAccept,
  deliveriesByRelease,
  deliveryStateColor,
  givesTo,
  lastSeenLabel,
  normalCode,
  plausibleURL,
  quiet,
  sendTargets,
  takesFrom,
  waitingForAcceptance,
  wordsLabel,
  type ReleaseDelivery,
  type ServerConnection,
} from './serverConnections';

function connection(over: Partial<ServerConnection>): ServerConnection {
  return {
    id: 'c1',
    name: 'dev',
    purpose: 'development',
    side: 'upstream',
    key: 'k',
    words: 'apple river stone cloud',
    requested_by: 'ana',
    created_at: '2026-11-20T10:00:00Z',
    ...over,
  };
}

describe('which servers release where', () => {
  it('Production takes from Staging or straight from Development', () => {
    expect(takesFrom('production')).toEqual(['staging', 'development']);
    expect(takesFrom('staging')).toEqual(['development']);
    expect(takesFrom('development')).toEqual([]);
  });

  it('Production gives releases to nobody', () => {
    expect(givesTo('production')).toBe(false);
    expect(givesTo('development')).toBe(true);
  });

  it('offers only the servers after this one to send to', () => {
    const list = [connection({ id: 'up' }), connection({ id: 'down', side: 'downstream' })];
    expect(sendTargets(list).map((c) => c.id)).toEqual(['down']);
  });
});

describe('accepting a connection', () => {
  it('waits for a server releases come from, until someone accepts', () => {
    expect(waitingForAcceptance(connection({}))).toBe(true);
    expect(waitingForAcceptance(connection({ accepted_at: '2026-11-20T10:05:00Z' }))).toBe(false);
    expect(waitingForAcceptance(connection({ side: 'downstream' }))).toBe(false);
  });

  it('is never for the administrator who connected it', () => {
    expect(canAccept(connection({}), 'ana')).toBe(false);
    expect(canAccept(connection({}), 'budi')).toBe(true);
    expect(canAccept(connection({}), undefined)).toBe(false);
  });

  it('reads the words with separators', () => {
    expect(wordsLabel(' apple  river stone cloud ')).toBe('apple · river · stone · cloud');
  });
});

describe('check-ins', () => {
  const now = new Date('2026-11-20T12:00:00Z');

  it('says so when a server never checked in, and guesses nothing', () => {
    expect(lastSeenLabel(undefined, now)).toBe('has not checked in yet');
    expect(quiet(undefined, now)).toBe(false);
  });

  it('counts minutes and hours', () => {
    expect(lastSeenLabel('2026-11-20T11:59:30Z', now)).toBe('checked in just now');
    expect(lastSeenLabel('2026-11-20T11:59:00Z', now)).toBe('checked in 1 minute ago');
    expect(lastSeenLabel('2026-11-20T11:30:00Z', now)).toBe('checked in 30 minutes ago');
    expect(lastSeenLabel('2026-11-20T09:00:00Z', now)).toBe('checked in 3 hours ago');
  });

  it('calls a server quiet after five minutes without a check-in', () => {
    expect(quiet('2026-11-20T11:56:00Z', now)).toBe(false);
    expect(quiet('2026-11-20T11:54:00Z', now)).toBe(true);
  });
});

describe('sent releases', () => {
  const d = (release: string, id: string, state: ReleaseDelivery['state'] = 'waiting'): ReleaseDelivery => ({
    id,
    connection_id: 'c',
    project_id: 'p',
    release,
    state,
    sent_by: 'ana',
    sent_at: '2026-11-20T10:00:00Z',
  });

  it('groups by release', () => {
    const got = deliveriesByRelease([d('r1', 'a'), d('r2', 'b'), d('r1', 'c')]);
    expect(got.get('r1')?.map((x) => x.id)).toEqual(['a', 'c']);
    expect(got.get('r2')?.length).toBe(1);
  });

  it('shows live green and refused red', () => {
    expect(deliveryStateColor('live')).toBe('green');
    expect(deliveryStateColor('refused')).toBe('red');
  });
});

describe('what people type', () => {
  it('keeps only the letters and digits of a code', () => {
    expect(normalCode(' abcd-efgh 2345 ')).toBe('ABCDEFGH2345');
  });

  it('takes only http and https addresses', () => {
    expect(plausibleURL('https://dev.example.com')).toBe(true);
    expect(plausibleURL('http://10.0.0.5:8080')).toBe(true);
    expect(plausibleURL('ftp://x')).toBe(false);
    expect(plausibleURL('dev.example.com')).toBe(false);
  });
});
