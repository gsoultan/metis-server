import { describe, expect, it } from 'bun:test';

import {
  MAX_FILE_BYTES,
  fileProblems,
  isImportKey,
  keyFromFileName,
  reportHeadline,
  splitOutcomes,
} from './gruleImport';

describe('fileProblems', () => {
  it('passes rule files within the limits', () => {
    expect(fileProblems([{ name: 'loan.grl', size: 900 }, { name: 'rules.JSON', size: 10 }])).toEqual([]);
  });

  it('names a file too large before it is uploaded', () => {
    expect(fileProblems([{ name: 'big.grl', size: MAX_FILE_BYTES + 1 }])).toEqual(['big.grl is larger than 1 MB.']);
  });

  it('names a file that is not a rule file', () => {
    expect(fileProblems([{ name: 'notes.txt', size: 1 }])).toEqual(['notes.txt is neither a .grl nor a .json file.']);
  });

  it('refuses more files, or more bytes, than the engine takes', () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ name: `r${i}.grl`, size: 1 }));
    expect(fileProblems(many)).toContain('Choose at most 50 files; 51 are chosen.');
    const heavy = Array.from({ length: 5 }, (_, i) => ({ name: `r${i}.grl`, size: MAX_FILE_BYTES }));
    expect(fileProblems(heavy)).toContain('The files come to more than 4 MB together.');
  });
});

describe('keys', () => {
  it('suggests a key the engine takes from a file name', () => {
    expect(keyFromFileName('Loan Rules.grl')).toBe('loan-rules');
    expect(keyFromFileName('2024_pricing.json')).toBe('pricing');
    expect(keyFromFileName('###.grl')).toBe('grule-rules');
    expect(isImportKey(keyFromFileName('a'.repeat(60) + '.grl'))).toBe(true);
  });

  it('accepts only what the engine accepts', () => {
    expect(isImportKey('loan-rules')).toBe(true);
    expect(isImportKey('Loan')).toBe(false);
    expect(isImportKey('1loan')).toBe(false);
    expect(isImportKey('')).toBe(false);
  });
});

describe('the report', () => {
  const report = {
    decisions: [{ key: 'loan-discount', name: 'Discount' }],
    rules: [
      { name: 'Gold', position: 'loan.grl:1', decision: 'loan-discount' },
      { name: 'Loop', position: 'loan.grl:9', reason: 'it sets a field it reads, so it would fire forever' },
    ],
  };

  it('splits the rules into those imported and those left out', () => {
    const { translated, skipped } = splitOutcomes(report.rules);
    expect(translated.map((r) => r.name)).toEqual(['Gold']);
    expect(skipped.map((r) => r.name)).toEqual(['Loop']);
  });

  it('says in a line what the import makes', () => {
    expect(reportHeadline(report)).toBe('1 of 2 rules in 1 decision table; 1 left out');
    expect(reportHeadline({ decisions: [], rules: [] })).toBe('0 of 0 rules in 0 decision tables');
  });
});
