/**
 * Which of a project's connections a connector step calls through.
 *
 * A project can hold several connections to one service: two databases, a
 * test and a live mail account. The engine reads a step's `connection`, the
 * connection's name, before anything else, and the name is the same in every
 * environment a release reaches. A step without one uses the project's
 * connection to that service, which is only a choice when there is one.
 */
import type { ApiConnectorInstance } from '../services/types';

export interface ConnectionChoice {
  value: string;
  label: string;
}

/** The step's connections to choose from: the project's ones to this connector. */
export function connectionChoices(
  instances: readonly ApiConnectorInstance[],
  connectorId: string,
): ConnectionChoice[] {
  return instances
    .filter((instance) => instance.connector?.id === connectorId && instance.name.trim() !== '')
    .map((instance) => ({ value: instance.name, label: instance.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The connection the step names, by name. A step saved before steps named
 * their connection holds its id instead; that is read as the name it has now.
 */
export function chosenConnection(
  data: Readonly<Record<string, unknown>>,
  instances: readonly ApiConnectorInstance[],
): string {
  const named = typeof data.connection === 'string' ? data.connection.trim() : '';
  if (named !== '') return named;
  const id = typeof data.connector_instance_id === 'string' ? data.connector_instance_id : '';
  if (id === '') return '';
  return instances.find((instance) => instance.id === id)?.name ?? '';
}

/**
 * What the step stores for a choice. The id goes with it, so the step names
 * its connection one way only; '' clears both and the step uses the project's
 * connection to the service.
 */
export function connectionPatch(name: string): { connection: string | undefined; connector_instance_id: string } {
  return { connection: name === '' ? undefined : name, connector_instance_id: '' };
}
