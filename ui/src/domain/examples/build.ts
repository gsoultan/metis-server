/**
 * Small builders for the worked examples, so each example reads as the
 * process it is rather than as the payload the engine takes.
 *
 * A node payload carries every field the designer can set. An example sets a
 * handful, and these fill in the rest the way a step dragged from the palette
 * starts out.
 */
import type { CreateDecisionPayload, CreateFlowPayload, CreateNodePayload } from '../../services/types';

/** One field of a start form or a task form, as the form builder writes it. */
export interface ExampleField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea';
  required?: boolean;
  description?: string;
  options?: { value: string; label: string }[];
}

/** What a step sets beyond its id, name, kind and place. */
export interface StepSettings {
  documentation?: string;
  assignee?: string;
  candidateGroups?: string[];
  properties?: Record<string, unknown>;
}

export function step(
  id: string,
  name: string,
  type: string,
  at: { x: number; y: number },
  settings: StepSettings = {},
): CreateNodePayload {
  return {
    id,
    name,
    type,
    x: at.x,
    y: at.y,
    width: 0,
    height: 0,
    is_expanded: false,
    assignee: settings.assignee ?? '',
    candidate_users: [],
    candidate_groups: settings.candidateGroups ?? [],
    priority: 0,
    due_date: '',
    form_key: '',
    default_flow: '',
    script: '',
    script_format: '',
    external_topic: '',
    documentation: settings.documentation ?? '',
    attached_to_ref: '',
    parent_id: '',
    cancel_activity: false,
    error_code: '',
    multi_instance_type: '',
    loop_cardinality: 0,
    collection: '',
    element_variable: '',
    completion_condition: '',
    is_event_sub_process: false,
    condition: '',
    properties: settings.properties ?? {},
  };
}

/** A path from one step to the next, taken when `condition` holds. */
export function path(id: string, from: string, to: string, condition = '', documentation = ''): CreateFlowPayload {
  return { id, source_ref: from, target_ref: to, condition, documentation, waypoints: [] };
}

/** A form, saved as the JSON text a step's form property holds. */
export function form(fields: readonly ExampleField[]): string {
  return JSON.stringify(fields);
}

/** A choice field whose options are written on it. */
export function choice(
  id: string,
  label: string,
  options: ReadonlyArray<readonly [value: string, label: string]>,
  extra: Pick<ExampleField, 'required' | 'description'> = { required: true },
): ExampleField {
  return { id, label, type: 'select', ...extra, options: options.map(([value, text]) => ({ value, label: text })) };
}

/** A decision table, as the decision editor saves one. */
export type ExampleDecision = CreateDecisionPayload;
