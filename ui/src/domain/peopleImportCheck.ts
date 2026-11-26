/**
 * Checking a directory before it is imported.
 *
 * The server reads the source, matches every row against the people already in
 * the project and says what importing would do, writing nothing. What follows
 * is how that answer is presented: which of a source's fields feed which of
 * Metis's, what each outcome means, and what to hand back to whoever owns the
 * source when rows were refused.
 */

/** The fields Metis imports, in the order a person reads them. */
export const IMPORT_FIELDS = ['external_id', 'username', 'display_name', 'email', 'groups', 'active'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, { label: string; hint: string; required?: boolean }> = {
  external_id: {
    label: 'External ID',
    hint: "The person's id in your application. Matched first, so a renamed login stays the same person.",
  },
  username: { label: 'Username', hint: 'What processes assign work to and people sign in with.', required: true },
  display_name: { label: 'Display name', hint: 'The name shown in task lists.' },
  email: { label: 'Email', hint: 'Where task notifications go.' },
  groups: { label: 'Teams', hint: 'Comma-separated team names. Missing teams are created.' },
  active: { label: 'Active', hint: 'true or false. Inactive people receive no new work.' },
};

/** Which source field feeds each Metis field. A field left out is not imported. */
export type FieldMapping = Partial<Record<ImportField, string>>;

/**
 * Names a source commonly uses for each field, most likely first.
 *
 * Only a first guess for the person to confirm: every guess is shown as a
 * choice they can change, and nothing is imported until they have seen it.
 */
const FIELD_GUESSES: Record<ImportField, string[]> = {
  external_id: ['external_id', 'id', 'user_id', 'userid', 'employee_id', 'employee_number', 'staff_id', 'uid'],
  username: ['username', 'login', 'user_name', 'user', 'handle', 'account', 'sam_account_name'],
  display_name: ['display_name', 'full_name', 'fullname', 'name', 'profile.full_name', 'profile.name'],
  email: ['email', 'work_email', 'mail', 'email_address', 'profile.email'],
  groups: ['groups', 'teams', 'team', 'departments', 'department', 'roles'],
  active: ['active', 'is_active', 'enabled', 'is_current', 'status'],
};

/**
 * A first mapping for the fields a source returned.
 *
 * One source field feeds at most one Metis field, so `id` guessed as the
 * external ID is not also offered as the username.
 */
export function guessMapping(fields: readonly string[]): FieldMapping {
  const available = new Map(fields.map((field) => [field.toLowerCase(), field]));
  const taken = new Set<string>();
  const mapping: FieldMapping = {};
  for (const target of IMPORT_FIELDS) {
    const hit = FIELD_GUESSES[target].find((name) => available.has(name) && !taken.has(name));
    if (hit) {
      mapping[target] = available.get(hit);
      taken.add(hit);
    }
  }
  return mapping;
}

/**
 * The mapping as the API takes it.
 *
 * A field mapped to its own name is left out: the server reads Metis's names
 * when nothing is mapped, and a shorter mapping is easier to read in a saved
 * directory's settings.
 */
export function mappingForRequest(mapping: FieldMapping): Record<string, string> {
  const out: Record<string, string> = {};
  for (const target of IMPORT_FIELDS) {
    const source = mapping[target]?.trim();
    if (source && source.toLowerCase() !== target) out[target] = source;
  }
  return out;
}

/** Whether the mapping names a username, the one field every row needs. */
export function mappingIsComplete(mapping: FieldMapping): boolean {
  return (mapping.username?.trim() ?? '') !== '';
}

/** What importing a row would do. */
export const OUTCOMES = ['new', 'update', 'linked', 'renamed', 'unchanged', 'conflict', 'invalid'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABELS: Record<Outcome, { label: string; colour: string; hint: string }> = {
  new: { label: 'New', colour: 'teal', hint: 'Added as a new person.' },
  update: { label: 'Update', colour: 'blue', hint: 'An existing person whose name, email, teams or status change.' },
  linked: {
    label: 'Linked',
    colour: 'indigo',
    hint: 'An existing person found by username, who now gets this external ID.',
  },
  renamed: {
    label: 'Renamed',
    colour: 'violet',
    hint: 'Found by external ID under a different username. Their username changes.',
  },
  unchanged: { label: 'No change', colour: 'gray', hint: 'Already up to date.' },
  conflict: {
    label: 'Conflict',
    colour: 'orange',
    hint: 'Refused: the username already belongs to somebody with another external ID.',
  },
  invalid: { label: 'Invalid', colour: 'red', hint: 'Refused: the row is missing something or repeats another row.' },
};

/** Outcomes that are refused, which nothing about the import will fix. */
export function isRefused(outcome: string): boolean {
  return outcome === 'conflict' || outcome === 'invalid';
}

/** One row, as the check reports it. */
export interface CheckedRow {
  line: number;
  outcome: Outcome;
  username?: string;
  external_id?: string;
  display_name?: string;
  email?: string;
  /** What changes, or why the row is refused. */
  detail?: string;
  /** For a rename: the open tasks that name the old username. */
  open_tasks?: number;
}

/** What the server found in a source, without writing anything. */
export interface ImportCheck {
  read: number;
  counts: Partial<Record<Outcome, number>>;
  /** Every field name the source returned, for the mapping step. */
  fields: string[];
  /** The first row's values by source field, for the mapping step. */
  sample?: Record<string, string>;
  rows: CheckedRow[];
  /** Whether the rows were cut; the counts still cover every row. */
  truncated?: boolean;
}

export function countOf(check: ImportCheck, outcome: Outcome): number {
  return check.counts[outcome] ?? 0;
}

/** How many rows would be written: everything not refused and not already up to date. */
export function writableCount(check: ImportCheck): number {
  return OUTCOMES.filter((outcome) => !isRefused(outcome) && outcome !== 'unchanged').reduce(
    (total, outcome) => total + countOf(check, outcome),
    0,
  );
}

export function refusedCount(check: ImportCheck): number {
  return countOf(check, 'conflict') + countOf(check, 'invalid');
}

/** The open tasks renames would carry, which needs the person's say-so. */
export function openTasksOnRenames(check: ImportCheck): number {
  return check.rows
    .filter((row) => row.outcome === 'renamed')
    .reduce((total, row) => total + (row.open_tasks ?? 0), 0);
}

/** The rows shown for a filter and a search, in source order. */
export function visibleRows(rows: readonly CheckedRow[], filter: Outcome | 'all' | 'refused', search: string): CheckedRow[] {
  const needle = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter === 'refused' ? !isRefused(row.outcome) : filter !== 'all' && row.outcome !== filter) return false;
    if (needle === '') return true;
    return [row.username, row.external_id, row.display_name, row.email].some((value) =>
      (value ?? '').toLowerCase().includes(needle),
    );
  });
}

/**
 * The refused rows as a CSV, for whoever owns the source.
 *
 * Each value is quoted, and one starting with a formula character is prefixed
 * so a spreadsheet shows it rather than running it: the values come from the
 * source, which is not ours.
 */
export function refusedRowsCsv(rows: readonly CheckedRow[]): string {
  const header = ['line', 'outcome', 'username', 'external_id', 'reason'];
  const lines = rows
    .filter((row) => isRefused(row.outcome))
    .map((row) => [String(row.line), row.outcome, row.username ?? '', row.external_id ?? '', row.detail ?? '']);
  return [header, ...lines].map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Renames that are skipped unless their open tasks are moved with them. */
export function renamesHoldingTasks(check: ImportCheck): number {
  return check.rows.filter((row) => row.outcome === 'renamed' && (row.open_tasks ?? 0) > 0).length;
}

/**
 * Whether every mapped field already has Metis's own name.
 *
 * An engine older than this page reads columns by Metis's names and ignores a
 * mapping, so only such a source can be imported there without a check.
 */
export function usesMetisNames(mapping: FieldMapping): boolean {
  return Object.keys(mappingForRequest(mapping)).length === 0;
}
