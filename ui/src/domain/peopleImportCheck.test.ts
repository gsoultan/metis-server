import { describe, expect, test } from 'bun:test';

import {
  guessMapping,
  mappingForRequest,
  mappingIsComplete,
  openTasksOnRenames,
  refusedRowsCsv,
  renamesHoldingTasks,
  usesMetisNames,
  visibleRows,
  writableCount,
  type CheckedRow,
  type ImportCheck,
} from './peopleImportCheck';

describe('guessMapping', () => {
  test('maps a typical HR export, one source field per Metis field', () => {
    expect(guessMapping(['id', 'login', 'profile.full_name', 'Work_Email', 'status'])).toEqual({
      external_id: 'id',
      username: 'login',
      display_name: 'profile.full_name',
      email: 'Work_Email',
      active: 'status',
    });
  });

  test("leaves a field unmapped rather than reusing another's source", () => {
    expect(guessMapping(['user'])).toEqual({ username: 'user' });
  });
});

describe('mappingForRequest', () => {
  test('drops fields mapped to their own name and blank ones', () => {
    expect(mappingForRequest({ username: 'username', external_id: ' id ', email: '' })).toEqual({ external_id: 'id' });
  });

  test('knows when a mapping is only Metis names', () => {
    expect(usesMetisNames({ username: 'username', email: 'email' })).toBe(true);
    expect(usesMetisNames({ username: 'login' })).toBe(false);
  });

  test('needs a username', () => {
    expect(mappingIsComplete({ external_id: 'id' })).toBe(false);
    expect(mappingIsComplete({ username: 'login' })).toBe(true);
  });
});

const rows: CheckedRow[] = [
  { line: 2, outcome: 'new', username: 'ada', email: 'ada@example.com' },
  { line: 3, outcome: 'renamed', username: 'grace.h', external_id: '1002', open_tasks: 3 },
  { line: 4, outcome: 'invalid', username: '=HYPERLINK("x")', detail: 'username "x" is already on line 2' },
  { line: 5, outcome: 'conflict', username: 'alan', external_id: '1004', detail: 'belongs to 9' },
];

const check: ImportCheck = {
  read: 5,
  counts: { new: 1, renamed: 1, invalid: 1, conflict: 1, unchanged: 1 },
  fields: [],
  rows,
};

describe('a checked import', () => {
  test('counts what would be written, leaving out refused and unchanged rows', () => {
    expect(writableCount(check)).toBe(2);
    expect(openTasksOnRenames(check)).toBe(3);
    expect(renamesHoldingTasks(check)).toBe(1);
  });

  test('filters by outcome, by refused, and by search across the identifiers', () => {
    expect(visibleRows(rows, 'refused', '').map((row) => row.line)).toEqual([4, 5]);
    expect(visibleRows(rows, 'all', '1002').map((row) => row.line)).toEqual([3]);
    expect(visibleRows(rows, 'new', 'EXAMPLE').map((row) => row.line)).toEqual([2]);
  });

  test('the refused rows download as CSV a spreadsheet will not run', () => {
    const csv = refusedRowsCsv(rows);
    expect(csv.split('\r\n')[0]).toBe('"line","outcome","username","external_id","reason"');
    expect(csv).toContain(`"4","invalid","'=HYPERLINK(""x"")","",`);
    expect(csv).not.toContain('"ada"');
  });
});
