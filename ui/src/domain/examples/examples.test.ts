import { describe, expect, it } from 'bun:test';

import { EXAMPLES, stepKindsUsed } from './index';
import { addExamples, type ExampleApi } from './install';
import { APPROVAL_PROCESS_KEY, approvalProcess, approvalRouteDecision } from './purchaseApproval';

/**
 * The examples are what somebody new learns the product from, so a broken
 * one teaches the wrong thing. These check what the engine would refuse or
 * misroute: a path to a step that does not exist, a step asking a table or a
 * process no example adds, and a diamond whose paths cannot be told apart.
 */
describe('the worked examples', () => {
  it('use every kind of step the palette offers, except scripts', () => {
    const used = stepKindsUsed();
    for (const kind of [
      'businessRuleTask',
      'userTask',
      'serviceTask',
      'callActivity',
      'manualTask',
      'exclusiveGateway',
      'parallelGateway',
    ]) {
      expect(used.has(kind)).toBe(true);
    }
    // Off unless the server's operator turns them on: an example with one
    // would stop with an incident on most installations.
    expect(used.has('scriptTask')).toBe(false);
  });

  it('use both ways of calling a system: a web address and a connector', () => {
    const ways = EXAMPLES.flatMap((example) =>
      example.process.nodes.filter((node) => node.type === 'serviceTask').map((node) => node.properties.implementation),
    );
    expect(ways).toContain('push');
    expect(ways).toContain('connector');
  });

  for (const example of EXAMPLES) {
    describe(example.title, () => {
      const { nodes, flows } = example.process;
      const ids = new Set(nodes.map((node) => node.id));

      it('has unique step and path ids', () => {
        expect(ids.size).toBe(nodes.length);
        expect(new Set(flows.map((flow) => flow.id)).size).toBe(flows.length);
      });

      it('joins only steps that exist', () => {
        for (const flow of flows) {
          expect(ids.has(flow.source_ref)).toBe(true);
          expect(ids.has(flow.target_ref)).toBe(true);
        }
      });

      it('leaves every step but a finish with somewhere to go', () => {
        for (const node of nodes) {
          if (node.type === 'endEvent') continue;
          expect(flows.some((flow) => flow.source_ref === node.id)).toBe(true);
        }
      });

      it('gives every path out of a choice a condition', () => {
        for (const node of nodes.filter((n) => n.type === 'exclusiveGateway')) {
          const out = flows.filter((flow) => flow.source_ref === node.id);
          expect(out.length).toBeGreaterThan(1);
          for (const flow of out) expect(flow.condition).not.toBe('');
        }
      });

      it('asks only tables an example adds, and adds each before its process', () => {
        const added = new Set(EXAMPLES.flatMap((e) => e.decisions.map((d) => d.key)));
        for (const node of nodes.filter((n) => n.type === 'businessRuleTask')) {
          expect(added.has(String(node.properties.decision_key))).toBe(true);
        }
      });

      it('has a table whose own tests match its lines', () => {
        for (const decision of example.decisions) {
          expect(decision.tests?.length ?? 0).toBeGreaterThan(0);
          const outputs = new Set((decision.outputs ?? []).map((o) => o.name));
          for (const test of decision.tests ?? []) {
            for (const name of Object.keys(test.expected ?? {})) expect(outputs.has(name)).toBe(true);
          }
        }
      });
    });
  }

  it('sends a revision back to whoever submitted, not to the last approver', () => {
    const revise = approvalProcess.nodes.find((node) => node.id === 'revise');
    expect(revise?.assignee).toBe('${submittedBy}');
    const into = approvalProcess.flows.filter((flow) => flow.target_ref === 'revise').map((flow) => flow.source_ref);
    expect(into.sort()).toEqual(['om-decided', 'uh-decided']);
  });

  it('routes a supervisor through the Operating Manager and an Operating Manager straight to the Unit Head', () => {
    const answer = (role: string) =>
      approvalRouteDecision.rules?.find((rule) => rule.inputs?.[0] === role)?.outputs?.[0];
    expect(answer('supervisor')).toBe('operating_manager');
    expect(answer('operating_manager')).toBe('unit_head');
    const target = (value: string) =>
      approvalProcess.flows.find((flow) => flow.source_ref === 'who-first' && flow.condition.includes(`"${value}"`))
        ?.target_ref;
    expect(target('operating_manager')).toBe('om-approves');
    expect(target('unit_head')).toBe('uh-approves');
  });

  it('runs the approval from the order, and adds the approval first', () => {
    const order = EXAMPLES.findIndex((e) => e.process.nodes.some((n) => n.type === 'callActivity'));
    const approval = EXAMPLES.findIndex((e) => e.process.key === APPROVAL_PROCESS_KEY);
    expect(approval).toBeLessThan(order);
    const call = EXAMPLES[order].process.nodes.find((n) => n.type === 'callActivity');
    expect(call?.properties.called_process_key).toBe(APPROVAL_PROCESS_KEY);
  });
});

function fakeApi(existing: { decisions?: string[]; processes?: string[]; groups?: string[]; mine?: string[] } = {}) {
  const calls: string[] = [];
  const groups = (existing.groups ?? []).map((name) => ({ id: `g-${name}`, name }));
  const api: ExampleApi = {
    findDecision: async (key) => ((existing.decisions ?? []).includes(key) ? `old-${key}` : null),
    createDecision: async (d) => {
      calls.push(`decision ${d.key}`);
      return `new-${d.key}`;
    },
    findProcess: async (key) => ((existing.processes ?? []).includes(key) ? `old-${key}` : null),
    createProcess: async (p) => {
      calls.push(`process ${p.key}`);
      return `new-${p.key}`;
    },
    listGroups: async () => groups,
    createGroup: async (g) => {
      calls.push(`group ${g.name}`);
      return `g-${g.name}`;
    },
    myGroups: async () => existing.mine ?? [],
    joinGroup: async (id) => {
      calls.push(`join ${id}`);
    },
    addGroupsToPeople: async (names) => {
      calls.push(`people ${names.join(',')}`);
    },
  };
  return { api, calls };
}

describe('adding the examples', () => {
  it('adds each table before the process that asks it, and the approval before the order', async () => {
    const { api, calls } = fakeApi();
    await addExamples(api, { joinGroups: false });
    expect(calls).toEqual([
      'decision example-approval-route',
      'process example-purchase-approval',
      'decision example-order-policy',
      'process example-equipment-order',
    ]);
  });

  it('leaves what is already there as it is, and links to it', async () => {
    const { api, calls } = fakeApi({ decisions: ['example-approval-route'], processes: ['example-purchase-approval'] });
    const { items } = await addExamples(api, { joinGroups: false });
    expect(calls).toEqual(['decision example-order-policy', 'process example-equipment-order']);
    expect(items.find((i) => i.key === 'example-purchase-approval')).toMatchObject({
      id: 'old-example-purchase-approval',
      outcome: 'already-there',
    });
  });

  it('creates the groups it needs and joins only those the person is not in', async () => {
    const { api, calls } = fakeApi({ groups: ['unit-heads'], mine: ['g-unit-heads'] });
    await addExamples(api, { joinGroups: true });
    expect(calls.slice(-3)).toEqual([
      'group operating-managers',
      'join g-operating-managers',
      'people operating-managers,unit-heads',
    ]);
  });

  it('still adds the examples when the groups cannot be set up, and says why', async () => {
    const { api } = fakeApi();
    api.createGroup = async () => {
      throw new Error('permission denied');
    };
    const { items, problems } = await addExamples(api, { joinGroups: true });
    expect(items.filter((i) => i.kind === 'process')).toHaveLength(2);
    expect(problems[0]).toContain('permission denied');
  });
});
