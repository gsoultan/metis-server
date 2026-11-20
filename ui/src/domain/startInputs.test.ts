import { describe, expect, it } from 'bun:test';

import type { FormField } from '../components/FormBuilder';
import { inputNamingProblem, inputsNeedingADefault, readStartInputs, startInputsOfProcess, startVariables } from './startInputs';

const amount: FormField = { id: 'amount', label: 'Amount', type: 'number', required: true };
const currency: FormField = { id: 'currency', label: 'Currency', type: 'select', required: true, defaultValue: 'GBP' };

describe('reading a start step\'s inputs', () => {
  it('reads a list, the same list as text, and a list under "fields"', () => {
    expect(readStartInputs([amount]).fields).toEqual([amount]);
    expect(readStartInputs(JSON.stringify([amount])).fields).toEqual([amount]);
    expect(readStartInputs({ fields: [amount] }).fields).toEqual([amount]);
  });

  it('reads a step with no inputs as none, without an error', () => {
    expect(readStartInputs(undefined)).toEqual({ fields: [], error: null });
    expect(readStartInputs('  ')).toEqual({ fields: [], error: null });
  });

  it('says so when the inputs cannot be read, rather than showing an empty form', () => {
    expect(readStartInputs('{not json').error).toMatch(/could not be read/);
    expect(readStartInputs({ amount: 1 }).error).toMatch(/not a list of fields/);
  });

  it('takes a process\'s inputs from its first start step, not one inside a sub-process', () => {
    const nodes = [
      { type: 'startEvent', parent_id: 'sub', properties: { start_form: [currency] } },
      { type: 'userTask', properties: { start_form: [currency] } },
      { type: 'startEvent', properties: { start_form: [amount] } },
    ];
    expect(startInputsOfProcess(nodes).fields).toEqual([amount]);
    expect(startInputsOfProcess(undefined).fields).toEqual([]);
  });
});

describe('what the engine would refuse at deploy', () => {
  it('names the required inputs that have no default', () => {
    const hidden: FormField = { id: 'reason', label: 'Reason', type: 'text', required: true, logic: { hiddenIf: 'amount < 10' } };
    const optional: FormField = { id: 'note', label: 'Note', type: 'text' };
    const heading: FormField = { id: 'h', label: 'Details', type: 'section', required: true };
    expect(inputsNeedingADefault([amount, currency, hidden, optional, heading])).toEqual(['amount']);
  });

  it('counts false and 0 as defaults', () => {
    expect(inputsNeedingADefault([{ ...amount, defaultValue: 0 }, { id: 'ok', label: 'OK', type: 'boolean', required: true, defaultValue: false }])).toEqual([]);
  });

  it('says when an input has no name or two share one', () => {
    expect(inputNamingProblem([amount, currency])).toBeNull();
    expect(inputNamingProblem([{ ...amount, id: ' ' }])).toMatch(/"Amount" has no variable name/);
    expect(inputNamingProblem([amount, { ...currency, id: 'amount' }])).toMatch(/Two inputs are named amount/);
  });
});

describe('the variables a run is started with', () => {
  it('leaves out what was left empty, so the engine fills the default or refuses', () => {
    const note: FormField = { id: 'note', label: 'Note', type: 'text' };
    expect(startVariables([amount, currency, note], { amount: 0, currency: null, note: ' ' })).toEqual({ amount: 0 });
  });

  it('sends nothing for an input the form was not showing', () => {
    const reason: FormField = { id: 'reason', label: 'Reason', type: 'text', defaultValue: 'none' };
    expect(startVariables([amount, reason], { amount: 5, reason: 'none' }, (field) => field.id === 'reason')).toEqual({ amount: 5 });
  });

  it('sends a date as the day, and nothing for a heading', () => {
    const due: FormField = { id: 'due', label: 'Due', type: 'date' };
    const heading: FormField = { id: 'h', label: 'Details', type: 'section' };
    expect(startVariables([due, heading], { due: '2026-01-31', h: '' })).toEqual({ due: '2026-01-31' });
    expect(startVariables([due], { due: new Date('2026-01-31T00:00:00Z') })).toEqual({ due: '2026-01-31' });
  });
});
