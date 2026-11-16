import { ActionIcon, Badge, Box, Button, Group, Text, Title, Tooltip } from '@mantine/core';
import { ArrowLeft, Pencil } from 'lucide-react';

import { StatusBadge } from '../StatusBadge';
import { instanceReference } from '../../domain/instanceList';
import classes from './DesignerHeader.module.css';

interface RunHeaderProps {
  processName: string;
  instanceId: string;
  /** The run's status as the server says it, or '' while it loads. */
  status: string;
  /** The names of the steps the run is on now. */
  currentSteps: string[];
  onBack: () => void;
  /** Opens the process itself, where it can be changed. */
  onOpenProcess: () => void;
}

/**
 * The header over one run of a process.
 *
 * A run used to open in the editor, with Deploy, the add and delete tools and
 * "Draft kept in this browser": somebody who came to see where one expense was
 * stood one click from changing the live process. This says what is on screen
 * — one run, its state and where it is — and puts editing behind its own
 * button.
 */
export function RunHeader({ processName, instanceId, status, currentSteps, onBack, onOpenProcess }: RunHeaderProps) {
  const where =
    currentSteps.length === 0
      ? status.toLowerCase() === 'completed' ? 'Finished' : 'Not on any step'
      : `At ${currentSteps.join(', ')}`;

  return (
    <Group justify="space-between" wrap="nowrap" gap="md" align="flex-start" className={classes.floatingBar}>
      <Group gap="sm" wrap="nowrap" className={classes.card} style={{ flex: '0 1 auto', minWidth: 0 }}>
        <Tooltip label="Back to instances">
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Back to instances" onClick={onBack}>
            <ArrowLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <Box style={{ minWidth: 0 }}>
          <Group gap={8} wrap="nowrap">
            <Title order={4} style={{ whiteSpace: 'nowrap' }}>{processName}</Title>
            <Badge variant="light" color="gray" size="sm" radius="sm" styles={{ label: { textTransform: 'none' } }}>
              Run {instanceReference(instanceId)}
            </Badge>
            {status !== '' && <StatusBadge status={status} />}
          </Group>
          <Text size="xs" c="dimmed" truncate>
            {where} · Viewing a run: nothing here changes the process
          </Text>
        </Box>
      </Group>

      <Group gap="sm" wrap="nowrap" className={classes.card}>
        <Button variant="default" size="sm" leftSection={<Pencil size={16} />} onClick={onOpenProcess}>
          Open the process
        </Button>
      </Group>
    </Group>
  );
}
