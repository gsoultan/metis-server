/**
 * The worked examples the Processes page can add to a project in one click,
 * so somebody new has a process and its decision table to open, run and
 * change, rather than an empty list.
 *
 * Each example says what it shows in plain words, and which table steers it
 * and how: the question people ask first is how a decision table and a
 * process relate. The answer is the same every time. A "Apply a business
 * rule" step asks the table, the table writes its answer into the process's
 * values, and the diamond after it only compares against that answer.
 */
import type { CreateDefinitionPayload } from '../../services/types';
import type { ExampleDecision } from './build';
import { approvalProcess, approvalRouteDecision, OPERATING_MANAGERS_GROUP, UNIT_HEADS_GROUP } from './purchaseApproval';
import { orderPolicyDecision, orderProcess } from './equipmentOrder';

export interface Example {
  id: string;
  title: string;
  /** One sentence: what the example is. */
  summary: string;
  /** How its decision table steers it, one point per line. */
  howTheDecisionDrives: string[];
  /** How to try it, in order. */
  tryIt: string[];
  /** Tables first: the process names them. */
  decisions: ExampleDecision[];
  process: CreateDefinitionPayload;
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'purchase-approval',
    title: 'Purchase approval by role',
    summary:
      'A request is approved level by level. Who approves first depends on the role of the person who submitted it.',
    howTheDecisionDrives: [
      '"Decide the first approver" asks the table "Example: first approver by role" with the submitter\'s role.',
      'A Supervisor gets operating_manager back, so the request goes to the Operating Manager and then to the Unit Head.',
      'An Operating Manager gets unit_head back, so the request skips straight to the Unit Head.',
      'When anyone sends it back for revision, it goes to the person who submitted it, not to the approver before them.',
      'To change the chain, edit the table. The process stays the same.',
    ],
    tryIt: [
      'Start it, type your own username and choose Supervisor.',
      'In your Inbox, approve it as the Operating Manager, then send it back as the Unit Head.',
      'The revision comes back to you. Resubmit it, and choose Operating Manager next time to see the shortcut.',
    ],
    decisions: [approvalRouteDecision],
    process: approvalProcess,
  },
  {
    id: 'equipment-order',
    title: 'Equipment order',
    summary:
      'An order that uses each kind of step: a business rule, a person, another process, a web service, a connector and work done offline.',
    howTheDecisionDrives: [
      '"Decide whether it needs approval" asks the table "Example: order policy" with the category and the amount.',
      'Small software and anything under USD 200 come back as needsApproval = no and go straight to ordering.',
      'Everything else comes back as yes, and the order runs the purchase approval example and waits for its answer.',
      'The table also picks the supplier, which the Slack message names.',
    ],
    tryIt: [
      'Start it with Software and USD 120: no approval is needed.',
      'Start it with Laptop and USD 1,400: the purchase approval runs first.',
      'Add a Slack connection under Connectors before an order reaches "Post the order in Slack".',
    ],
    decisions: [orderPolicyDecision],
    process: orderProcess,
  },
];

/**
 * The groups the approval steps are offered to. An example adds them, with
 * the person adding it as a member, so every step can be tried by one person.
 */
export const EXAMPLE_GROUPS: ReadonlyArray<{ name: string; description: string }> = [
  { name: OPERATING_MANAGERS_GROUP, description: 'Approves requests from supervisors (example)' },
  { name: UNIT_HEADS_GROUP, description: 'Gives the final approval (example)' },
];

/** The kinds of step the examples use together, by the palette's names. */
export function stepKindsUsed(examples: readonly Example[] = EXAMPLES): Set<string> {
  return new Set(examples.flatMap((example) => example.process.nodes.map((node) => node.type ?? '')));
}
