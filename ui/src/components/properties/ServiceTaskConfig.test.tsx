import { afterEach, describe, expect, it, mock } from 'bun:test';

import { appStoreDouble, resetAppStore, setAppState } from '../../testing/appStoreDouble';
import { namedControl, visibleText } from '../../testing/markup';
import { renderMarkup } from '../../testing/renderMarkup';
import type { BPMNNodeData } from '../../types/bpmn';

mock.module('../../store/useAppStore', () => ({ useAppStore: appStoreDouble }));

const DATABASE = { id: 'connector-db', name: 'Database Lookup', description: 'Look something up.', node_schema: [] };
let projectConnections: Array<{ id: string; name: string; connector: { id: string } }> = [];
const realConnectorHooks = await import('../../hooks/useConnectors');
mock.module('../../hooks/useConnectors', () => ({
  ...realConnectorHooks,
  useConnectors: () => ({ data: { connectors: [DATABASE] } }),
  useConnectorInstances: () => ({ data: { instances: projectConnections } }),
}));

const { ServiceTaskConfig } = await import('./ServiceTaskConfig');

afterEach(() => {
  resetAppStore();
  projectConnections = [];
});

function render(settings: Record<string, unknown>, expertMode: boolean): string {
  setAppState({ expertMode });
  const data = { label: 'Work it out', nodeType: 'serviceTask', ...settings } as BPMNNodeData;
  return renderMarkup(<ServiceTaskConfig data={data} onUpdate={() => undefined} />);
}

const SCRIPT_STEP = { implementation: 'script', script: 'setVar("total", 1)' };

/**
 * Basic mode shows what a step does read-only when it is a way basic mode
 * does not offer.
 *
 * A step set to run a script kept a live choice in basic mode. Choosing "Call
 * a web address" there turned the script off, and basic mode offers no script,
 * so there was no way back short of finding Expert mode.
 */
describe('what a service task calls', () => {
  it('shows a script step as something this step cannot do, and lets basic mode move off it', () => {
    // A service task cannot run a script: the engine skipped it as if it called
    // nothing, and deploy refuses it now. Leaving it is the fix, so the choice
    // stays open even in basic mode.
    const html = render(SCRIPT_STEP, false);

    expect(namedControl(html, 'Implementation')?.value).toBe('Run a script (this step cannot)');
    expect(visibleText(html)).toContain('A step that calls another system cannot run a script');
  });

  it('shows a way this editor does not know read-only in basic mode, under its own name', () => {
    const html = render({ implementation: 'soap' }, false);

    expect(namedControl(html, 'Implementation')).toBeUndefined();
    expect(visibleText(html)).toContain('soap');
  });

  it('lets basic mode choose among the ways it offers', () => {
    expect(namedControl(render({ implementation: 'push' }, false), 'Implementation')?.value).toBe('Call a web address');
  });

  it('lets expert mode move a script step off running a script', () => {
    expect(namedControl(render(SCRIPT_STEP, true), 'Implementation')?.value).toBe('Run a script (this step cannot)');
  });
});

/**
 * A project can hold several connections to one service. The step names the
 * one it uses, by the name it has in every environment.
 */
describe('which connection a connector step uses', () => {
  const STEP = { implementation: 'connector', connector_id: DATABASE.id };

  it('offers the project\'s connections to that service', () => {
    projectConnections = [
      { id: 'i-1', name: 'Billing', connector: { id: DATABASE.id } },
      { id: 'i-2', name: 'Warehouse', connector: { id: DATABASE.id } },
    ];
    const html = render({ ...STEP, connection: 'Warehouse' }, false);

    expect(namedControl(html, 'Connection')?.value).toBe('Warehouse');
  });

  it('shows the default when the step names none', () => {
    projectConnections = [{ id: 'i-1', name: 'Billing', connector: { id: DATABASE.id } }];

    expect(namedControl(render(STEP, false), 'Connection')?.value).toBe("The project's connection (Billing)");
  });

  it('says to add one when the project has none', () => {
    const html = render(STEP, false);

    expect(namedControl(html, 'Connection')).toBeUndefined();
    expect(visibleText(html)).toContain('This project has no connection to this service yet.');
  });
});
