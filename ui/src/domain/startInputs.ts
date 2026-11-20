/**
 * What a run of a process must be started with: the inputs its start step
 * declares, saved under `start_form`.
 *
 * It is a form in the shape a task's form has, so one editor writes both. The
 * engine owns the rule (entities/start_inputs.go in gsoultan/metis): a start
 * that leaves out a required input is refused, however it arrives, and an
 * input left out takes its default. What is here reads the same setting, to
 * ask for the inputs before the start is sent and to say, while the step is
 * being edited, what the engine would refuse at deploy.
 */
import type { FormField } from '../components/FormBuilder';

/** The setting the inputs are saved under, as the engine reads it. */
export const START_FORM = 'start_form';

export interface StartInputs {
  fields: FormField[];
  /** Why the inputs could not be read, in words; null when they could. */
  error: string | null;
}

const NONE: StartInputs = { fields: [], error: null };

/** Reads a start step's inputs: a list of fields, or the same as JSON text. */
export function readStartInputs(raw: unknown): StartInputs {
  if (raw === undefined || raw === null) return NONE;
  let form = raw;
  if (typeof raw === 'string') {
    if (raw.trim() === '') return NONE;
    try {
      form = JSON.parse(raw);
    } catch {
      return { fields: [], error: "This process's inputs could not be read. Ask whoever built it to check its start step." };
    }
  }
  if (Array.isArray(form)) return { fields: form as FormField[], error: null };
  const nested = (form as { fields?: unknown } | null)?.fields;
  if (Array.isArray(nested)) return { fields: nested as FormField[], error: null };
  return { fields: [], error: "This process's inputs are not a list of fields. Ask whoever built it to check its start step." };
}

interface DeployedStep {
  type?: string;
  parent_id?: string;
  properties?: Record<string, unknown>;
}

/** The inputs of a deployed process: those of its first start step. */
export function startInputsOfProcess(nodes: readonly DeployedStep[] | undefined): StartInputs {
  const start = (nodes ?? []).find((node) => node.type === 'startEvent' && !node.parent_id);
  return readStartInputs(start?.properties?.[START_FORM]);
}

function hasNoValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function isConditional(field: FormField): boolean {
  return (field.logic?.hiddenIf ?? '').trim() !== '';
}

/**
 * The required inputs a run that is given nothing could not fill: those with
 * no default. A process on a schedule has nobody to give them, and the engine
 * refuses to deploy one.
 */
export function inputsNeedingADefault(fields: readonly FormField[]): string[] {
  return fields
    .filter((field) => field.type !== 'section' && field.required && !isConditional(field) && hasNoValue(field.defaultValue))
    .map((field) => field.id);
}

/** What is wrong with the inputs as they are named, as the engine would say at deploy. */
export function inputNamingProblem(fields: readonly FormField[]): string | null {
  const seen = new Set<string>();
  for (const field of fields) {
    if (field.type === 'section') continue;
    const name = (field.id ?? '').trim();
    if (name === '') return `"${field.label}" has no variable name. Give it one, or the process cannot be deployed.`;
    if (seen.has(name)) return `Two inputs are named ${name}. Rename one, or the process cannot be deployed.`;
    seen.add(name);
  }
  return null;
}

/**
 * The variables to start a run with, from what the form holds.
 *
 * An input left empty is not sent, so the engine fills in its default or says
 * it is required. Neither is one the form was not showing: what sits in a
 * hidden field is not something the person chose. A date is sent as the day
 * it names.
 *
 * The form starts a number at 0 and a tick box unticked, and those are values:
 * they are sent as they stand.
 */
export function startVariables(
  fields: readonly FormField[],
  values: Record<string, unknown>,
  isHidden: (field: FormField) => boolean = () => false,
): Record<string, unknown> {
  const variables: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === 'section' || isHidden(field)) continue;
    const value = values[field.id];
    if (hasNoValue(value)) continue;
    variables[field.id] = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  }
  return variables;
}
