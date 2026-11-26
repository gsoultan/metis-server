/**
 * Bringing a Grule rule set in as decision tables and a process.
 *
 * The engine does the translating and reports on every rule. What is here is
 * what the dialog decides before it asks: whether the files can be sent at all,
 * which key to suggest, and how to tell the report back.
 */

/** Mirrors entities.GruleRuleOutcome. */
export interface GruleRuleOutcome {
  name: string;
  /** Where the rule is: `rules.grl:12`. */
  position: string;
  /** The table the rule became a line of; empty when it was left out. */
  decision?: string;
  /** Why the rule was left out. */
  reason?: string;
  notes?: string[];
}

/** Mirrors entities.GruleImport, as much of it as the dialog shows. */
export interface GruleImportReport {
  decisions?: Array<{ key: string; name: string; rules?: unknown[] }>;
  process?: { key: string; name: string };
  rules?: GruleRuleOutcome[];
  /** The process variable each field a rule sets is written to. */
  results?: Record<string, string>;
  warnings?: string[];
  stored?: boolean;
  process_id?: string;
}

/** One rule file, read. */
export interface RuleFile {
  name: string;
  content: string;
}

// The engine's limits (logic/grule/limits.go). Checked here too so that a
// file too large is named before it is uploaded, not after.
export const MAX_FILE_BYTES = 1 << 20;
export const MAX_TOTAL_BYTES = 4 << 20;
export const MAX_FILES = 50;

/** What is wrong with a choice of files before anything is sent; empty when nothing is. */
export function fileProblems(files: ReadonlyArray<{ name: string; size: number }>): string[] {
  const problems: string[] = [];
  if (files.length > MAX_FILES) {
    problems.push(`Choose at most ${MAX_FILES} files; ${files.length} are chosen.`);
  }
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      problems.push(`${file.name} is larger than 1 MB.`);
    }
    if (!/\.(grl|json)$/i.test(file.name)) {
      problems.push(`${file.name} is neither a .grl nor a .json file.`);
    }
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    problems.push('The files come to more than 4 MB together.');
  }
  return problems;
}

const KEY_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

/** Whether the engine takes this as the key the tables and the process are named from. */
export function isImportKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/** A key suggested from a file's name: `Loan Rules.grl` → `loan-rules`. */
export function keyFromFileName(name: string): string {
  const slug = name
    .replace(/\.[^.]*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .replace(/-+$/, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'grule-rules';
}

/** The rules split into those that became lines of a table and those left out. */
export function splitOutcomes(rules: ReadonlyArray<GruleRuleOutcome> | undefined): {
  translated: GruleRuleOutcome[];
  skipped: GruleRuleOutcome[];
} {
  const translated: GruleRuleOutcome[] = [];
  const skipped: GruleRuleOutcome[] = [];
  for (const rule of rules ?? []) {
    (rule.decision ? translated : skipped).push(rule);
  }
  return { translated, skipped };
}

/** One line saying what an import makes, or would make. */
export function reportHeadline(report: GruleImportReport): string {
  const { translated, skipped } = splitOutcomes(report.rules);
  const tables = report.decisions?.length ?? 0;
  const made = `${translated.length} of ${translated.length + skipped.length} rule${
    translated.length + skipped.length === 1 ? '' : 's'
  } in ${tables} decision table${tables === 1 ? '' : 's'}`;
  return skipped.length ? `${made}; ${skipped.length} left out` : made;
}
