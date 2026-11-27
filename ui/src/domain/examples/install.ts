/**
 * Adding the worked examples to a project.
 *
 * Safe to run twice: an example table or process that is already there is
 * left as it is, so somebody who changed an example keeps their change, and
 * is linked to rather than replaced. Tables go in before the processes that
 * ask them, and the purchase approval before the order that runs it, so
 * nothing is deployed naming something that does not exist yet.
 */
import type { CreateDefinitionPayload } from '../../services/types';
import type { ExampleDecision } from './build';
import { EXAMPLE_GROUPS, EXAMPLES, type Example } from './index';

/** What adding the examples needs from the server. */
export interface ExampleApi {
  /** The id of the decision with this key, or null when there is none. */
  findDecision(key: string): Promise<string | null>;
  createDecision(decision: ExampleDecision): Promise<string>;
  /** The id of the live (or newest) version of this process, or null. */
  findProcess(key: string): Promise<string | null>;
  createProcess(process: CreateDefinitionPayload): Promise<string>;
  /** The groups the signed-in person can see, by name. */
  listGroups(): Promise<Array<{ id: string; name: string }>>;
  createGroup(group: { name: string; description: string }): Promise<string>;
  /** The ids of the groups the signed-in person is in. */
  myGroups(): Promise<string[]>;
  joinGroup(groupId: string): Promise<void>;
  /**
   * Brings organization groups, with their members, into the project's People
   * directory, which is where a step's groups are looked up.
   */
  addGroupsToPeople(names: string[]): Promise<void>;
}

export interface AddedItem {
  kind: 'decision' | 'process' | 'group';
  key: string;
  name: string;
  id: string;
  outcome: 'added' | 'already-there' | 'joined';
}

export interface AddExamplesResult {
  items: AddedItem[];
  /**
   * What could not be done, in words. The groups are a convenience: without
   * them the examples are still added, and their tasks wait for whoever
   * joins the groups later.
   */
  problems: string[];
}

export interface AddExamplesOptions {
  /** Create the approval groups and put the signed-in person in both. */
  joinGroups: boolean;
}

export async function addExamples(
  api: ExampleApi,
  options: AddExamplesOptions,
  examples: readonly Example[] = EXAMPLES,
): Promise<AddExamplesResult> {
  const items: AddedItem[] = [];
  const problems: string[] = [];

  for (const example of examples) {
    for (const decision of example.decisions) {
      const existing = await api.findDecision(decision.key);
      if (existing !== null) {
        items.push({
          kind: 'decision',
          key: decision.key,
          name: decision.name,
          id: existing,
          outcome: 'already-there',
        });
        continue;
      }
      const id = await api.createDecision(decision);
      items.push({ kind: 'decision', key: decision.key, name: decision.name, id, outcome: 'added' });
    }
    const { process } = example;
    const existing = await api.findProcess(process.key);
    if (existing !== null) {
      items.push({ kind: 'process', key: process.key, name: process.name, id: existing, outcome: 'already-there' });
      continue;
    }
    const id = await api.createProcess(process);
    items.push({ kind: 'process', key: process.key, name: process.name, id, outcome: 'added' });
  }

  if (options.joinGroups) {
    try {
      items.push(...(await joinExampleGroups(api)));
    } catch (error) {
      problems.push(
        `The examples were added, but the approval groups could not be set up: ${messageOf(error)}. ` +
          `Ask an administrator to create ${EXAMPLE_GROUPS.map((g) => g.name).join(' and ')} and add you to them.`,
      );
    }
  }
  return { items, problems };
}

async function joinExampleGroups(api: ExampleApi): Promise<AddedItem[]> {
  const [groups, mine] = await Promise.all([api.listGroups(), api.myGroups()]);
  const items: AddedItem[] = [];
  for (const wanted of EXAMPLE_GROUPS) {
    let id = groups.find((group) => group.name === wanted.name)?.id;
    if (id === undefined) {
      id = await api.createGroup(wanted);
      items.push({ kind: 'group', key: wanted.name, name: wanted.name, id, outcome: 'added' });
    }
    if (!mine.includes(id)) {
      await api.joinGroup(id);
      items.push({ kind: 'group', key: wanted.name, name: wanted.name, id, outcome: 'joined' });
    }
  }
  await api.addGroupsToPeople(EXAMPLE_GROUPS.map((group) => group.name));
  return items;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
