import { Alert, Badge, Button, Group, List, Select, Stack, Text, TextInput } from '@mantine/core';
import { AlertTriangle, CheckCircle2, Repeat } from 'lucide-react';
import { useState } from 'react';

import {
  ON_MISSING,
  ON_MISSING_LABELS,
  SCHEDULE_OPTIONS,
  outcomeTone,
  problemsInFileOrder,
  summarise,
  type ImportSummary,
} from '../../domain/participantImport';
import classes from './PeopleImport.module.css';

interface DoneStepProps {
  result: ImportSummary;
  /** Offered for an endpoint or a query, to administrators. */
  canKeepInSync: boolean;
  suggestedName: string;
  onKeepInSync: (directory: { name: string; schedule: string; on_missing: string }) => void;
  saving: boolean;
  saved: boolean;
}

/**
 * Step four: what landed, and the offer to keep reading the same source.
 *
 * A partial import is a warning, not a success: the good rows landed, and the
 * refused ones are listed where somebody will see them.
 */
export function DoneStep({ result, canKeepInSync, suggestedName, onKeepInSync, saving, saved }: DoneStepProps) {
  const tone = outcomeTone(result);
  const problems = problemsInFileOrder(result);

  return (
    <Stack gap="md">
      <Alert
        color={tone === 'partial' ? 'orange' : tone === 'success' ? 'teal' : 'gray'}
        variant="light"
        radius="md"
        icon={tone === 'partial' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
        title={tone === 'none' ? 'Nothing changed' : 'Imported'}
      >
        <Stack gap="xs">
          <Group gap="xs">
            <Text size="sm" fw={600}>{summarise(result)}</Text>
            {problems.length > 0 && <Badge color="orange" variant="filled" size="sm">{problems.length} not imported</Badge>}
          </Group>
          {problems.length > 0 && (
            <List size="xs" spacing={2} withPadding>
              {problems.slice(0, 10).map((problem) => (
                <List.Item key={`${problem.line}-${problem.reason}`}>
                  <Text size="xs" span ff="monospace">line {problem.line}</Text>
                  {problem.username ? <Text size="xs" span fw={600}> ({problem.username})</Text> : null}
                  <Text size="xs" span c="dimmed">: {problem.reason}</Text>
                </List.Item>
              ))}
              {problems.length > 10 && <List.Item><Text size="xs" c="dimmed">and {problems.length - 10} more</Text></List.Item>}
            </List>
          )}
        </Stack>
      </Alert>

      {canKeepInSync && (
        <KeepInSync suggestedName={suggestedName} onSave={onKeepInSync} saving={saving} saved={saved} />
      )}
    </Stack>
  );
}

function KeepInSync({
  suggestedName,
  onSave,
  saving,
  saved,
}: {
  suggestedName: string;
  onSave: DoneStepProps['onKeepInSync'];
  saving: boolean;
  saved: boolean;
}) {
  const [name, setName] = useState(suggestedName);
  const [schedule, setSchedule] = useState('R/P1D');
  const [onMissing, setOnMissing] = useState('leave');

  if (saved) {
    return (
      <Alert color="teal" variant="light" radius="md" icon={<Repeat size={16} />} title="Kept in sync">
        <Text size="sm">
          Saved as a directory with the same field matching. You will find it under Directories on this page, where you
          can run it, pause it or change its schedule.
        </Text>
      </Alert>
    );
  }

  return (
    <div className={classes.panel}>
      <Stack gap="sm">
        <Group gap="xs">
          <Repeat size={16} aria-hidden="true" />
          <Text fw={700} size="sm">Keep this in sync</Text>
        </Group>
        <Text size="xs" c="dimmed">
          Read the same source on a schedule, with the same field matching and checks. Credentials are stored
          encrypted.
        </Text>
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <Group grow align="flex-start">
          <Select
            label="Run"
            data={SCHEDULE_OPTIONS}
            value={schedule}
            onChange={(value) => setSchedule(value ?? '')}
            allowDeselect={false}
          />
          <Select
            label="When somebody is no longer in the source"
            data={ON_MISSING.map((value) => ({ value, label: ON_MISSING_LABELS[value].label }))}
            value={onMissing}
            onChange={(value) => setOnMissing(value ?? 'leave')}
            description={ON_MISSING_LABELS[onMissing]?.hint}
            allowDeselect={false}
          />
        </Group>
        <Group justify="flex-end">
          <Button
            loading={saving}
            disabled={name.trim() === ''}
            onClick={() => onSave({ name: name.trim(), schedule, on_missing: onMissing })}
          >
            Save directory
          </Button>
        </Group>
      </Stack>
    </div>
  );
}
