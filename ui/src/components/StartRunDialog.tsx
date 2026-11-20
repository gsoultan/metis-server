import { Alert, Button, Center, Group, Loader, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Play } from 'lucide-react';
import { useState } from 'react';

import { startInputsOfProcess, startVariables } from '../domain/startInputs';
import { useDefinition, useStartProcess } from '../hooks/useProcess';
import { errorMessage } from '../services/shared/errors';
import type { ProcessVariables } from '../services/types';
import { TaskForm } from './TaskForm';

/** The version a run is about to be started on. */
export interface RunTarget {
  id: string;
  key: string;
  name: string;
  version: number;
}

/**
 * "Yes, start it", and what to start it with.
 *
 * A process whose start step declares inputs is asked for them here, in the
 * form its builder drew. The engine refuses a start that leaves out a required
 * one, so asking first is the difference between a form and an error. A
 * refusal is shown in the dialog, with what was typed still in it.
 *
 * A process with no inputs gets the question it always got.
 */
export function StartRunDialog({ target, onClose }: { target: RunTarget | null; onClose: () => void }) {
  return (
    <Modal
      opened={target !== null}
      onClose={onClose}
      title={<Text fw={700}>Start {target?.name}?</Text>}
      radius="lg"
    >
      {target && <StartRun key={target.id} target={target} onClose={onClose} />}
    </Modal>
  );
}

function StartRun({ target, onClose }: { target: RunTarget; onClose: () => void }) {
  const { data, isLoading, error } = useDefinition(target.id);
  const startProcess = useStartProcess();
  const [refusal, setRefusal] = useState<string | null>(null);

  const inputs = startInputsOfProcess(data?.definition?.nodes);

  const start = async (variables?: Record<string, unknown>) => {
    setRefusal(null);
    try {
      // startProcess raises on a refusal, so the catch below is the one path.
      await startProcess.mutateAsync({ definitionKey: target.key, variables: variables as ProcessVariables | undefined });
      notifications.show({ title: `Started ${target.name}`, message: 'Follow it under Instances.', color: 'green' });
      onClose();
    } catch (err: unknown) {
      setRefusal(errorMessage(err, 'It did not start.'));
    }
  };

  if (isLoading) {
    return <Center py="xl"><Loader /></Center>;
  }

  const asksForInputs = inputs.fields.length > 0;

  return (
    <Stack gap="md">
      <Text size="sm">
        A new instance of version {target.version} starts now. Its first steps run immediately, and anyone
        given a task in it is notified.
      </Text>

      {error && (
        <Alert variant="light" color="orange" p="xs">
          <Text size="xs">What this process asks for could not be loaded, so it is not asked for here.</Text>
        </Alert>
      )}
      {inputs.error !== null && (
        <Alert variant="light" color="orange" p="xs">
          <Text size="xs">{inputs.error}</Text>
        </Alert>
      )}
      {refusal !== null && (
        <Alert variant="light" color="red" p="xs" title={`Could not start ${target.name}`}>
          <Text size="xs">{refusal}</Text>
        </Alert>
      )}

      {asksForInputs ? (
        <TaskForm
          fields={inputs.fields}
          variables={{}}
          onSubmit={(values) => start(startVariables(inputs.fields, values))}
          loading={startProcess.isPending}
          submit={{ label: 'Start', icon: <Play size={14} />, color: 'green' }}
          onCancel={onClose}
        />
      ) : (
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button
            color="green"
            leftSection={<Play size={14} />}
            loading={startProcess.isPending}
            onClick={() => start()}
          >
            Start
          </Button>
        </Group>
      )}
    </Stack>
  );
}
