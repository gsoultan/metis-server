import {
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useState, useTransition } from 'react';

import { ConnectorManifests } from '../components/ConnectorManifests';
import { PageHeader } from '../components/PageHeader';
import { OutgoingWebhookSettings } from '../components/outgoingWebhooks/OutgoingWebhookSettings';
import { WebhookSettings } from '../components/WebhookSettings';
import { ConnectorInstanceTable } from '../components/connectors/ConnectorInstanceTable';
import { ConnectorSetupWizard } from '../components/connectors/ConnectorSetupWizard';
import { ConnectorTestModal, type TestResult } from '../components/connectors/ConnectorTestModal';
import { CustomConnectorModal } from '../components/connectors/CustomConnectorModal';
import { ConnectorGlyph } from '../components/connectors/ConnectorGlyph';
import { emptyFormFor, type InstanceFormState } from '../components/connectors/instanceForm';
import { CardGridLoadingState, ErrorState } from '../components/state';
import { matchesQuery } from '../domain/textSearch';
import {
  useConnectorInstances,
  useConnectors,
  useCreateConnector,
  useCreateConnectorInstance,
  useDeleteConnectorInstance,
  useExecuteConnector,
  useUpdateConnectorInstance,
} from '../hooks/useProcess';
import { errorMessage } from '../services/shared/errors';
import type { ApiConnector, ApiConnectorInstance, CreateConnectorPayload } from '../services/types';
import { useAppStore } from '../store/useAppStore';
import type { ConnectorSection } from '../routes/_authenticated.connectors';
import { SegmentedControl } from '@mantine/core';
import classes from './Connectors.module.css';

const DEFAULT_TEST_PAYLOAD = '{\n  "text": "Hello from Metis!"\n}';
const CONFIGURATION_STEP = 1;

/** What each connector page is for, under its title. */
const SECTION_COPY: Record<ConnectorSection, { title: string; description: string }> = {
  catalogue: {
    title: 'Catalogue',
    description: 'Services this project can connect to. Connect one once, then any step can use it.',
  },
  connections: {
    title: 'My connections',
    description: "This project's connections, each with its own name and settings. A step picks one by name.",
  },
  documents: { title: 'Connectors from a document', description: '' },
  outgoing: { title: 'Outgoing webhooks', description: '' },
  incoming: { title: 'Incoming webhooks', description: '' },
};

export function Connectors({ section = 'catalogue' }: { section?: ConnectorSection }) {
  const { currentProjectId, expertMode } = useAppStore();
  const {
    data: connectorsData,
    isLoading: connectorsLoading,
    error: connectorsError,
    refetch: refetchConnectors,
  } = useConnectors();
  const { data: instancesData, isLoading: instancesLoading, isFetching: instancesFetching } = useConnectorInstances();
  const queryClient = useQueryClient();
  const createInstance = useCreateConnectorInstance();
  const updateInstance = useUpdateConnectorInstance();
  const deleteInstance = useDeleteConnectorInstance();
  const testConnector = useExecuteConnector();
  const createConnector = useCreateConnector();

  const [wizardOpened, wizard] = useDisclosure(false);
  const [testOpened, testModal] = useDisclosure(false);
  const [customOpened, customModal] = useDisclosure(false);

  const [selectedConnector, setSelectedConnector] = useState<ApiConnector | null>(null);
  const [editingInstance, setEditingInstance] = useState<ApiConnectorInstance | null>(null);
  const [form, setForm] = useState<InstanceFormState>({ name: '', config: {} });
  const [activeStep, setActiveStep] = useState(0);
  const [testPayload, setTestPayload] = useState(DEFAULT_TEST_PAYLOAD);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [catalogueQuery, setCatalogueQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [, startTransition] = useTransition();

  const connectors = connectorsData?.connectors ?? [];
  const instances = instancesData?.instances ?? [];
  const catalogue = connectors.filter((c) => matchesQuery(catalogueQuery, c.name, c.description, c.key));

  const beginSetup = (connector: ApiConnector) => {
    setSelectedConnector(connector);
    setEditingInstance(null);
    setActiveStep(0);
    setForm(emptyFormFor(connector));
    wizard.open();
  };

  const beginEdit = (instance: ApiConnectorInstance) => {
    setSelectedConnector(connectors.find((c) => c.id === instance.connector?.id) ?? null);
    setEditingInstance(instance);
    setActiveStep(CONFIGURATION_STEP);
    setForm({ name: instance.name, config: { ...(instance.config ?? {}) } });
    wizard.open();
  };

  const beginTest = (instance: ApiConnectorInstance, connector: ApiConnector | undefined) => {
    setSelectedConnector(connector ?? null);
    setForm({ name: instance.name, config: { ...(instance.config ?? {}) } });
    setTestResult(null);
    testModal.open();
  };

  const save = async () => {
    if (!currentProjectId || !selectedConnector) return;
    const payload = { project: { id: currentProjectId }, connector: { id: selectedConnector.id }, ...form };
    try {
      if (editingInstance) {
        await updateInstance.mutateAsync({ id: editingInstance.id, ...payload });
        notifications.show({ title: 'Saved', message: `${form.name} was updated.`, color: 'green' });
      } else {
        await createInstance.mutateAsync(payload);
        notifications.show({ title: 'Connected', message: `${form.name} is ready to use.`, color: 'green' });
      }
      wizard.close();
    } catch (err: unknown) {
      notifications.show({ title: 'Could not save it', message: errorMessage(err, 'The connection was not saved.'), color: 'red' });
    }
  };

  const remove = async (instance: ApiConnectorInstance) => {
    const consequence =
      `Remove the ${instance.name} connection? ` +
      'Steps in this project that use it will fail until they are pointed at another connection.';
    if (!window.confirm(consequence)) return;
    try {
      await deleteInstance.mutateAsync(instance.id);
      notifications.show({ title: 'Removed', message: `${instance.name} is gone.`, color: 'blue' });
    } catch (err: unknown) {
      notifications.show({ title: 'Could not remove it', message: errorMessage(err, 'The connection was not removed.'), color: 'red' });
    }
  };

  const runTest = async () => {
    if (!selectedConnector) return;
    setTestResult(null);
    try {
      const payload = JSON.parse(testPayload);
      const data = await testConnector.mutateAsync({ connectorKey: selectedConnector.key, config: form.config, payload });
      setTestResult({ success: true, data });
    } catch (err: unknown) {
      setTestResult({ success: false, error: errorMessage(err, 'The test failed.') });
    }
  };

  const saveCustomConnector = async (values: CreateConnectorPayload) => {
    try {
      await createConnector.mutateAsync(values);
      notifications.show({ title: 'Template created', message: `${values.name} is in the catalogue.`, color: 'green' });
      customModal.close();
    } catch (err: unknown) {
      notifications.show({ title: 'Could not create it', message: errorMessage(err, 'The template was not created.'), color: 'red' });
    }
  };

  const refreshInstances = () => queryClient.invalidateQueries({ queryKey: ['connector-instances', currentProjectId] });

  const types = Array.from(new Set(connectors.map((c) => c.type ?? '').filter((type) => type !== ''))).sort();
  const shown = catalogue.filter((c) => typeFilter === 'all' || c.type === typeFilter);
  const connectionsOf = (connector: ApiConnector) => instances.filter((i) => i.connector?.id === connector.id);
  const copy = SECTION_COPY[section];

  return (
    <Stack gap="lg">
      {section === 'documents' && <ConnectorManifests asPage />}
      {section === 'outgoing' && <OutgoingWebhookSettings asPage />}
      {section === 'incoming' && <WebhookSettings asPage />}

      {section === 'catalogue' && (
        <>
          <PageHeader
            title={copy.title}
            description={copy.description}
            actions={
              expertMode ? (
                <Button variant="default" leftSection={<Plus size={16} />} onClick={customModal.open}>
                  Custom connector
                </Button>
              ) : undefined
            }
          />
          <Group gap="sm" wrap="wrap">
            <TextInput
              aria-label="Search the catalogue"
              placeholder="Search the catalogue"
              leftSection={<Search size={16} />}
              w={320}
              onChange={(e) => {
                const value = e.currentTarget.value;
                startTransition(() => setCatalogueQuery(value));
              }}
            />
            {types.length > 1 && (
              <SegmentedControl
                aria-label="Kind of service"
                value={typeFilter}
                onChange={(value) => setTypeFilter(String(value))}
                data={[
                  { value: 'all', label: `All ${catalogue.length}` },
                  ...types.map((type) => ({
                    value: type,
                    label: `${type.charAt(0).toUpperCase()}${type.slice(1).toLowerCase()} ${catalogue.filter((c) => c.type === type).length}`,
                  })),
                ]}
              />
            )}
          </Group>
          {connectorsLoading || instancesLoading ? (
            <CardGridLoadingState count={6} cols={3} />
          ) : connectorsError ? (
            <ErrorState error={connectorsError} action="load your connectors" onRetry={() => refetchConnectors()} />
          ) : shown.length === 0 ? (
            <Text size="sm" c="dimmed">Nothing in the catalogue matches “{catalogueQuery}”.</Text>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
              {shown.map((connector) => {
                const connected = connectionsOf(connector);
                return (
                  <Card key={connector.id} withBorder padding="md" radius="lg" className={classes.card}>
                    <Group gap="sm" wrap="nowrap" mb="sm">
                      <span className={classes.glyph} aria-hidden>
                        <ConnectorGlyph name={connector.icon} size={18} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <Text fw={600} size="sm" truncate>{connector.name}</Text>
                        <Text size="xs" c="dimmed" tt="capitalize">{connector.type?.toLowerCase()}</Text>
                      </div>
                    </Group>
                    <Text size="sm" c="dimmed" lineClamp={2} className={classes.description}>
                      {connector.description}
                    </Text>
                    <Group justify="space-between" className={classes.footer}>
                      {connected.length > 0 ? (
                        <Badge color="green" variant="light" radius="xl">
                          {connected.length === 1 ? 'Connected' : `${connected.length} connections`}
                        </Badge>
                      ) : (
                        <Text size="xs" c="dimmed">Not connected</Text>
                      )}
                      <Button variant="default" size="xs" leftSection={<Plus size={14} />} onClick={() => beginSetup(connector)}>
                        {connected.length > 0 ? 'Add another' : 'Connect'}
                      </Button>
                    </Group>
                  </Card>
                );
              })}
            </SimpleGrid>
          )}
        </>
      )}

      {section === 'connections' && (
        <>
          <PageHeader
            title={copy.title}
            description={copy.description}
            actions={
              <Button variant="default" onClick={refreshInstances} loading={instancesFetching}>
                Refresh
              </Button>
            }
          />
          <ConnectorInstanceTable
            instances={instances}
            connectors={connectors}
            expertMode={expertMode}
            onTest={beginTest}
            onEdit={beginEdit}
            onDelete={remove}
          />
        </>
      )}

      <ConnectorSetupWizard
        opened={wizardOpened}
        onClose={wizard.close}
        connector={selectedConnector}
        editing={editingInstance !== null}
        storedConfig={editingInstance?.config}
        form={form}
        onFormChange={setForm}
        activeStep={activeStep}
        onStepChange={setActiveStep}
        onTest={() => { setTestResult(null); testModal.open(); }}
        onSave={save}
        saving={createInstance.isPending || updateInstance.isPending}
      />

      <ConnectorTestModal
        opened={testOpened}
        onClose={testModal.close}
        connectorName={selectedConnector?.name}
        config={form.config}
        payload={testPayload}
        onPayloadChange={setTestPayload}
        onExecute={runTest}
        pending={testConnector.isPending}
        result={testResult}
      />

      {expertMode && (
        <CustomConnectorModal
          opened={customOpened}
          onClose={customModal.close}
          onSubmit={saveCustomConnector}
          pending={createConnector.isPending}
        />
      )}
    </Stack>
  );
}
