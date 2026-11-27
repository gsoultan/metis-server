/**
 * Worked example: an equipment order that uses every kind of step the
 * palette offers apart from scripts, which a server runs only when its
 * operator has switched them on.
 *
 * A decision table decides whether the order needs approval; when it does,
 * the order runs the purchase approval example as a process of its own and
 * waits for it. Then it calls a public web service, and does two things at
 * once: posts in a Slack channel through a connector, and waits for somebody
 * to deliver the equipment.
 */
import { choice, form, path, step, type ExampleDecision } from './build';
import { APPROVAL_PROCESS_KEY } from './purchaseApproval';
import type { CreateDefinitionPayload } from '../../services/types';

export const ORDER_PROCESS_KEY = 'example-equipment-order';
export const ORDER_POLICY_DECISION_KEY = 'example-order-policy';

/**
 * The Slack connector's catalogue entry. Its id is the same on every server,
 * and the step uses whichever Slack connection the project has.
 */
export const SLACK_CONNECTOR_ID = '018e1a1a-1a1a-7a1a-a1a1-1a1a1a1a1a1b';

/** A free public service with the European Central Bank's daily rates. */
export const EXCHANGE_RATES_URL = 'https://api.frankfurter.dev/v1/latest?base=USD';

export const orderPolicyDecision: ExampleDecision = {
  key: ORDER_POLICY_DECISION_KEY,
  name: 'Example: order policy',
  hit_policy: 'FIRST',
  inputs: [
    { id: 'in_category', label: 'Category', expression: 'category', type: 'string' },
    { id: 'in_amount', label: 'Amount (USD)', expression: 'amount', type: 'number' },
  ],
  outputs: [
    { id: 'out_needs', label: 'Needs approval', name: 'needsApproval', type: 'string' },
    { id: 'out_supplier', label: 'Supplier', name: 'supplier', type: 'string' },
  ],
  rules: [
    {
      id: 'small-software',
      description: 'Software under USD 500 is bought straight away',
      inputs: ['software', '< 500'],
      outputs: ['no', 'Software store'],
    },
    {
      id: 'small-anything',
      description: 'Anything under USD 200 needs no approval',
      inputs: ['-', '< 200'],
      outputs: ['no', 'Office supplies'],
    },
    {
      id: 'laptops',
      description: 'Laptops always go through approval',
      inputs: ['laptop', '-'],
      outputs: ['yes', 'Laptop vendor'],
    },
    {
      id: 'everything-else',
      description: 'Everything else goes through approval',
      inputs: ['-', '-'],
      outputs: ['yes', 'General supplier'],
    },
  ],
  tests: [
    {
      id: 'cheap-software',
      name: 'A USD 120 licence needs no approval',
      inputs: { category: 'software', amount: 120 },
      expected: { needsApproval: 'no', supplier: 'Software store' },
    },
    {
      id: 'laptop',
      name: 'A laptop needs approval',
      inputs: { category: 'laptop', amount: 1400 },
      expected: { needsApproval: 'yes', supplier: 'Laptop vendor' },
    },
  ],
};

export const orderProcess: CreateDefinitionPayload = {
  key: ORDER_PROCESS_KEY,
  name: 'Example: equipment order',
  nodes: [
    step(
      'start',
      'Order requested',
      'startEvent',
      { x: 40, y: 300 },
      {
        documentation:
          'The same submittedBy and submitterRole as the purchase approval, which this order runs when it ' +
          'needs approval: a process that runs another passes it everything it has.',
        properties: {
          start_form: form([
            { id: 'submittedBy', label: 'Your username', type: 'text', required: true },
            choice('submitterRole', 'Your role', [
              ['supervisor', 'Supervisor'],
              ['operating_manager', 'Operating Manager'],
            ]),
            { id: 'item', label: 'What to order', type: 'text', required: true },
            choice('category', 'Category', [
              ['laptop', 'Laptop'],
              ['furniture', 'Furniture'],
              ['software', 'Software'],
            ]),
            { id: 'amount', label: 'Amount (USD)', type: 'number', required: true },
          ]),
        },
      },
    ),
    step(
      'decide-policy',
      'Decide whether it needs approval',
      'businessRuleTask',
      { x: 180, y: 280 },
      {
        documentation:
          'Asks the decision table "Example: order policy". It reads category and amount and writes ' +
          'needsApproval and supplier. The first line that matches wins.',
        properties: { decision_key: ORDER_POLICY_DECISION_KEY },
      },
    ),
    step(
      'needs-approval',
      'Needs approval?',
      'exclusiveGateway',
      { x: 400, y: 300 },
      {
        documentation: 'Reads needsApproval, which the table wrote.',
      },
    ),
    step(
      'run-approval',
      'Run the purchase approval',
      'callActivity',
      { x: 540, y: 120 },
      {
        documentation:
          'Starts "Example: purchase approval by role" with this order\'s values, and waits until it finishes. ' +
          'Its approval value comes back here.',
        properties: { called_process_key: APPROVAL_PROCESS_KEY },
      },
    ),
    step('approved', 'Approved?', 'exclusiveGateway', { x: 780, y: 140 }),
    step('not-placed', 'Order not placed', 'endEvent', { x: 920, y: 30 }),
    step(
      'get-rates',
      "Get today's exchange rates",
      'serviceTask',
      { x: 920, y: 280 },
      {
        documentation:
          'Calls a free public web service and keeps rates and date from its answer as exchangeRates and ' +
          'ratesDate. Replace the address with one of your own systems.',
        properties: {
          implementation: 'push',
          http_url: EXCHANGE_RATES_URL,
          http_method: 'GET',
          output_rates: 'exchangeRates',
          output_date: 'ratesDate',
        },
      },
    ),
    step('split', 'Do both at once', 'parallelGateway', { x: 1160, y: 300 }),
    step(
      'tell-team',
      'Post the order in Slack',
      'serviceTask',
      { x: 1280, y: 140 },
      {
        documentation:
          "Uses the project's Slack connection. Add one under Connectors (a Slack incoming webhook) before " +
          'running an order this far; until then the order stops here and says which connection is missing.',
        properties: {
          implementation: 'connector',
          connector_id: SLACK_CONNECTOR_ID,
          connector_field_text: '{{submittedBy}} ordered {{item}} for USD {{amount}} from {{supplier}}.',
        },
      },
    ),
    step(
      'deliver',
      'Deliver the equipment',
      'manualTask',
      { x: 1280, y: 420 },
      {
        documentation:
          'Happens away from any system. The order waits until the person who ordered says the equipment arrived.',
        assignee: '${submittedBy}',
      },
    ),
    step('join', 'Both done', 'parallelGateway', { x: 1520, y: 300 }),
    step('placed', 'Order placed', 'endEvent', { x: 1640, y: 310 }),
  ],
  flows: [
    path('f-start', 'start', 'decide-policy'),
    path('f-policy', 'decide-policy', 'needs-approval'),
    path('f-needs', 'needs-approval', 'run-approval', 'needsApproval = "yes"'),
    path('f-no-need', 'needs-approval', 'get-rates', 'needsApproval = "no"'),
    path('f-ran', 'run-approval', 'approved'),
    path('f-approved', 'approved', 'get-rates', 'approval = "approve"'),
    path('f-refused', 'approved', 'not-placed', 'approval != "approve"'),
    path('f-rates', 'get-rates', 'split'),
    path('f-split-tell', 'split', 'tell-team'),
    path('f-split-deliver', 'split', 'deliver'),
    path('f-told', 'tell-team', 'join'),
    path('f-delivered', 'deliver', 'join'),
    path('f-end', 'join', 'placed'),
  ],
};
