import { describe, expect, test } from 'bun:test';

import type { ApiConnectorInstance } from '../services/types';
import { chosenConnection, connectionChoices, connectionPatch } from './connectionChoice';

const db = 'connector-db';
const mail = 'connector-mail';
const instances: ApiConnectorInstance[] = [
  { id: 'i-2', name: 'Warehouse', connector: { id: db } },
  { id: 'i-1', name: 'Billing', connector: { id: db } },
  { id: 'i-3', name: 'Support inbox', connector: { id: mail } },
];

describe('the connections a step can call through', () => {
  test('are the project’s connections to that connector, by name', () => {
    expect(connectionChoices(instances, db)).toEqual([
      { value: 'Billing', label: 'Billing' },
      { value: 'Warehouse', label: 'Warehouse' },
    ]);
  });

  test('are none when the project has no connection to it', () => {
    expect(connectionChoices(instances, 'connector-other')).toEqual([]);
  });
});

describe('the connection a step names', () => {
  test('is its connection name', () => {
    expect(chosenConnection({ connection: 'Billing' }, instances)).toBe('Billing');
  });

  test('is read from the id a step saved before steps named one', () => {
    expect(chosenConnection({ connector_instance_id: 'i-2' }, instances)).toBe('Warehouse');
  });

  test('is none when the step names nothing, or an id no longer here', () => {
    expect(chosenConnection({}, instances)).toBe('');
    expect(chosenConnection({ connector_instance_id: 'gone' }, instances)).toBe('');
  });
});

describe('choosing a connection', () => {
  test('stores the name and drops the id', () => {
    expect(connectionPatch('Billing')).toEqual({ connection: 'Billing', connector_instance_id: '' });
  });

  test('back to the default clears both', () => {
    expect(connectionPatch('')).toEqual({ connection: undefined, connector_instance_id: '' });
  });
});
