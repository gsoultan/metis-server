import { describe, expect, test } from 'bun:test';

import {
  directoryConfig,
  emptySource,
  headerMap,
  readCsvHead,
  sourceIsReady,
  sourceRequest,
  suggestedDirectoryName,
} from './peopleImportSource';

const api = {
  ...emptySource(),
  kind: 'http' as const,
  url: ' https://hr.example.com/api/staff ',
  headers: [
    { name: 'Authorization', value: 'Bearer abc' },
    { name: ' ', value: 'ignored' },
  ],
};

describe('an import source', () => {
  test('is ready only with what its kind needs', () => {
    expect(sourceIsReady(emptySource())).toBe(false);
    expect(sourceIsReady(api)).toBe(true);
    expect(sourceIsReady({ ...api, url: 'hr.example.com' })).toBe(false);
    expect(sourceIsReady({ ...emptySource(), kind: 'postgres', dsn: 'postgres://h/db', query: '' })).toBe(false);
  });

  test('drops headers with no name', () => {
    expect(headerMap(api.headers)).toEqual({ Authorization: 'Bearer abc' });
  });

  test('builds one body for the check and the import, with the mapping', () => {
    expect(sourceRequest(api, { username: 'login', external_id: 'id' }, true)).toEqual({
      kind: 'http',
      url: 'https://hr.example.com/api/staff',
      method: 'GET',
      headers: { Authorization: 'Bearer abc' },
      mapping: { username: 'login', external_id: 'id' },
      move_open_tasks: true,
    });
  });

  test('saves a directory with the same source and mapping, and no kind or file', () => {
    expect(directoryConfig(api, { username: 'username' }, false)).toEqual({
      url: 'https://hr.example.com/api/staff',
      method: 'GET',
      headers: { Authorization: 'Bearer abc' },
    });
    expect(suggestedDirectoryName(api)).toBe('hr.example.com people');
  });
});

describe('reading the head of a CSV', () => {
  test('finds the columns and first row, with quotes and a byte-order mark', () => {
    const head = readCsvHead('\uFEFFid,login,"full, name"\r\n1001,ada,"Ada ""A."" Lovelace"\r\n1002,grace,Grace\r\n');
    expect(head.fields).toEqual(['id', 'login', 'full, name']);
    expect(head.sample).toEqual({ id: '1001', login: 'ada', 'full, name': 'Ada "A." Lovelace' });
    expect(head.rows).toBe(2);
  });

  test('a file with only a header has no sample values', () => {
    expect(readCsvHead('username,email')).toEqual({ fields: ['username', 'email'], sample: { username: '', email: '' }, rows: 0 });
  });
});
