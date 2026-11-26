/**
 * Where an import reads its people from, as the dialog holds it.
 *
 * One draft for all three kinds, so moving between the source cards keeps what
 * was typed into each. What is sent is built from it here, once, for the
 * check, the import and a saved directory alike — which is what makes the rows
 * imported the rows that were checked.
 */
import { mappingForRequest, type FieldMapping } from './peopleImportCheck';
import type { SourceKind } from './participantImport';

export interface HeaderDraft {
  name: string;
  value: string;
}

export interface SourceDraft {
  kind: SourceKind;
  file: File | null;
  url: string;
  method: 'GET' | 'POST';
  headers: HeaderDraft[];
  dsn: string;
  query: string;
}

export const emptySource = (): SourceDraft => ({
  kind: 'csv',
  file: null,
  url: '',
  method: 'GET',
  headers: [],
  dsn: '',
  query: '',
});

/** Whether the chosen source has enough to be read. The server checks again. */
export function sourceIsReady(draft: SourceDraft): boolean {
  switch (draft.kind) {
    case 'csv':
      return draft.file !== null;
    case 'http':
      return /^https?:\/\/\S+$/i.test(draft.url.trim());
    case 'postgres':
      return draft.dsn.trim() !== '' && draft.query.trim() !== '';
  }
}

/** Headers by name, leaving out a row with no name. A later duplicate wins. */
export function headerMap(headers: readonly HeaderDraft[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of headers) {
    const name = header.name.trim();
    if (name !== '') out[name] = header.value;
  }
  return out;
}

/** The fields that say where the rows come from, without the mapping. */
function where(draft: SourceDraft): Record<string, unknown> {
  switch (draft.kind) {
    case 'csv':
      return { file: draft.file };
    case 'http': {
      const headers = headerMap(draft.headers);
      return {
        url: draft.url.trim(),
        method: draft.method,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      };
    }
    case 'postgres':
      return { dsn: draft.dsn, query: draft.query };
  }
}

/** The body of a check or an import. */
export function sourceRequest(draft: SourceDraft, mapping: FieldMapping, moveOpenTasks: boolean): Record<string, unknown> {
  const mapped = mappingForRequest(mapping);
  return {
    kind: draft.kind,
    ...where(draft),
    ...(Object.keys(mapped).length > 0 ? { mapping: mapped } : {}),
    ...(moveOpenTasks ? { move_open_tasks: true } : {}),
  };
}

/** A file is read once; only an endpoint or a query can be kept in sync. */
export function canKeepInSync(kind: SourceKind): kind is 'http' | 'postgres' {
  return kind !== 'csv';
}

/**
 * The configuration a saved directory keeps, so a scheduled run reads the
 * same source through the same mapping as the import that was just checked.
 */
export function directoryConfig(draft: SourceDraft, mapping: FieldMapping, moveOpenTasks: boolean): Record<string, unknown> {
  const { kind: _kind, file: _file, ...rest } = sourceRequest(draft, mapping, moveOpenTasks);
  return rest;
}

/** A name for a saved directory, from its address, for the person to change. */
export function suggestedDirectoryName(draft: SourceDraft): string {
  if (draft.kind === 'http') {
    try {
      return `${new URL(draft.url.trim()).hostname} people`;
    } catch {
      return 'People from an API';
    }
  }
  return 'People from a database';
}

/** How much of a file is read in the browser to find its columns. */
export const CSV_HEAD_BYTES = 64 * 1024;

/**
 * The column names and first row of a CSV, read in the browser.
 *
 * Enough for matching columns before the file is sent anywhere. Quoted values,
 * doubled quotes and a byte-order mark are handled; the server parses the
 * whole file again, and its reading is the one the import uses.
 */
export function readCsvHead(text: string): { fields: string[]; sample: Record<string, string>; rows: number } {
  const records = parseCsv(text.replace(/^\uFEFF/, ''), 2);
  const fields = (records[0] ?? []).map((name) => name.trim()).filter((name) => name !== '');
  const first = records[1] ?? [];
  const sample: Record<string, string> = {};
  fields.forEach((field, index) => {
    sample[field] = (first[index] ?? '').slice(0, 200);
  });
  const rows = text.split(/\r?\n/).filter((line) => line.trim() !== '').length - 1;
  return { fields, sample, rows: Math.max(rows, 0) };
}

function parseCsv(text: string, limit: number): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length && records.length < limit; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      record.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (records.length < limit && (cell !== '' || record.length > 0)) {
    record.push(cell);
    records.push(record);
  }
  return records;
}
