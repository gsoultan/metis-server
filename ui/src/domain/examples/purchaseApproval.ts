/**
 * Worked example: a purchase request approved level by level, where a
 * decision table says who approves first from the submitter's role.
 *
 *   Supervisor submits          → Operating Manager → Unit Head
 *   Operating Manager submits   → Unit Head
 *   Anyone sends it back        → the person who submitted it, never the
 *                                 approver before them
 *
 * The table answers one question, "who approves first?", and the process
 * reads the answer at the diamond after it. Changing the policy, for example
 * sending a new role straight to the Unit Head, is a new line in the table:
 * the process does not change.
 */
import { choice, form, path, step, type ExampleDecision } from './build';
import type { CreateDefinitionPayload } from '../../services/types';

export const APPROVAL_PROCESS_KEY = 'example-purchase-approval';
export const APPROVAL_ROUTE_DECISION_KEY = 'example-approval-route';

/** The groups whose members approve at each level. */
export const OPERATING_MANAGERS_GROUP = 'operating-managers';
export const UNIT_HEADS_GROUP = 'unit-heads';

const ROLES = [
  ['supervisor', 'Supervisor'],
  ['operating_manager', 'Operating Manager'],
] as const;

const APPROVER_FORM = form([
  choice('approval', 'Your decision', [
    ['approve', 'Approve'],
    ['revise', 'Send back for revision'],
    ['reject', 'Reject'],
  ]),
  { id: 'approverNote', label: 'Note for the submitter', type: 'textarea' },
]);

export const approvalRouteDecision: ExampleDecision = {
  key: APPROVAL_ROUTE_DECISION_KEY,
  name: 'Example: first approver by role',
  hit_policy: 'UNIQUE',
  inputs: [{ id: 'in_role', label: "Submitter's role", expression: 'submitterRole', type: 'string' }],
  outputs: [{ id: 'out_first', label: 'First approver', name: 'firstApprover', type: 'string' }],
  rules: [
    {
      id: 'supervisor',
      description: "A supervisor's request goes to an Operating Manager first, then to the Unit Head",
      inputs: ['supervisor'],
      outputs: ['operating_manager'],
    },
    {
      id: 'operating-manager',
      description: 'An Operating Manager is already that level, so their request goes straight to the Unit Head',
      inputs: ['operating_manager'],
      outputs: ['unit_head'],
    },
  ],
  tests: [
    {
      id: 'supervisor-first',
      name: 'A supervisor is approved by an Operating Manager first',
      inputs: { submitterRole: 'supervisor' },
      expected: { firstApprover: 'operating_manager' },
    },
    {
      id: 'operating-manager-first',
      name: 'An Operating Manager goes straight to the Unit Head',
      inputs: { submitterRole: 'operating_manager' },
      expected: { firstApprover: 'unit_head' },
    },
  ],
};

export const approvalProcess: CreateDefinitionPayload = {
  key: APPROVAL_PROCESS_KEY,
  name: 'Example: purchase approval by role',
  nodes: [
    step(
      'start',
      'Request submitted',
      'startEvent',
      { x: 40, y: 300 },
      {
        documentation:
          'The submitter fills this in. submittedBy is remembered for the whole request, so a revision always ' +
          'comes back to this person. submitterRole is what the decision table reads.',
        properties: {
          start_form: form([
            {
              id: 'submittedBy',
              label: 'Your username',
              type: 'text',
              required: true,
              description: 'A request sent back for revision comes back to this person.',
            },
            choice('submitterRole', 'Your role', ROLES),
            { id: 'item', label: 'What is being bought', type: 'text', required: true },
            { id: 'amount', label: 'Amount (USD)', type: 'number', required: true },
          ]),
        },
      },
    ),
    step(
      'decide-route',
      'Decide the first approver',
      'businessRuleTask',
      { x: 180, y: 280 },
      {
        documentation:
          'Asks the decision table "Example: first approver by role". It reads submitterRole and writes ' +
          'firstApprover: operating_manager for a supervisor, unit_head for an Operating Manager. The diamond ' +
          'after this step only compares against that answer, so the policy lives in the table.',
        properties: { decision_key: APPROVAL_ROUTE_DECISION_KEY },
      },
    ),
    step(
      'who-first',
      'Who approves first?',
      'exclusiveGateway',
      { x: 400, y: 300 },
      {
        documentation: 'Reads firstApprover, which the table wrote. Chooses a path and changes nothing.',
      },
    ),
    step(
      'om-approves',
      'Operating Manager approves',
      'userTask',
      { x: 540, y: 120 },
      {
        documentation:
          'Approve the request, send it back to the person who submitted it, or reject it. Offered to everyone in the operating-managers group.',
        candidateGroups: [OPERATING_MANAGERS_GROUP],
        properties: { form_definition: APPROVER_FORM },
      },
    ),
    step('om-decided', "Operating Manager's decision", 'exclusiveGateway', { x: 780, y: 140 }),
    step(
      'uh-approves',
      'Unit Head approves',
      'userTask',
      { x: 920, y: 280 },
      {
        documentation:
          'Approve the request, send it back to the person who submitted it, or reject it. Offered to everyone in the unit-heads group.',
        candidateGroups: [UNIT_HEADS_GROUP],
        properties: { form_definition: APPROVER_FORM },
      },
    ),
    step('uh-decided', "Unit Head's decision", 'exclusiveGateway', { x: 1160, y: 300 }),
    step(
      'revise',
      'Submitter revises the request',
      'userTask',
      { x: 920, y: 500 },
      {
        documentation:
          'Your request was sent back to you because you submitted it. Correct it and resubmit, or withdraw it. ' +
          'A resubmitted request starts again at the first approver for your role.',
        assignee: '${submittedBy}',
        properties: {
          form_definition: form([
            choice('revision', 'What next?', [
              ['resubmit', 'Resubmit'],
              ['withdraw', 'Withdraw the request'],
            ]),
            { id: 'item', label: 'What is being bought', type: 'text' },
            { id: 'amount', label: 'Amount (USD)', type: 'number' },
          ]),
        },
      },
    ),
    step('revised', 'Resubmitted?', 'exclusiveGateway', { x: 680, y: 520 }),
    step('approved', 'Approved', 'endEvent', { x: 1320, y: 310 }),
    step('rejected', 'Rejected', 'endEvent', { x: 1320, y: 150 }),
    step('withdrawn', 'Withdrawn', 'endEvent', { x: 540, y: 640 }),
  ],
  flows: [
    path('f-start', 'start', 'decide-route'),
    path('f-route', 'decide-route', 'who-first'),
    path('f-first-om', 'who-first', 'om-approves', 'firstApprover = "operating_manager"'),
    path('f-first-uh', 'who-first', 'uh-approves', 'firstApprover = "unit_head"'),
    path('f-om', 'om-approves', 'om-decided'),
    path('f-om-approve', 'om-decided', 'uh-approves', 'approval = "approve"'),
    path('f-om-revise', 'om-decided', 'revise', 'approval = "revise"'),
    path('f-om-reject', 'om-decided', 'rejected', 'approval = "reject"'),
    path('f-uh', 'uh-approves', 'uh-decided'),
    path('f-uh-approve', 'uh-decided', 'approved', 'approval = "approve"'),
    path('f-uh-revise', 'uh-decided', 'revise', 'approval = "revise"'),
    path('f-uh-reject', 'uh-decided', 'rejected', 'approval = "reject"'),
    path('f-revise', 'revise', 'revised'),
    path('f-resubmit', 'revised', 'decide-route', 'revision = "resubmit"'),
    path('f-withdraw', 'revised', 'withdrawn', 'revision = "withdraw"'),
  ],
};
