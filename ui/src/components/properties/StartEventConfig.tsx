import { Alert, Button, Code, Group, JsonInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { Wand2 } from 'lucide-react';

import type { NodeConfigProps } from '../PropertyPanel';
import { asText } from '../../types/bpmn';
import { defaultSchedule } from '../../domain/startSchedule';
import { START_TRIGGERS, chooseStartTrigger, scheduleOf, startTriggerOf, type StartTrigger } from '../../domain/startTrigger';
import { PropertySection } from './PropertySection';
import { StartScheduleEditor } from './StartScheduleEditor';

/** A starting point, so the field is never a blank box. */
const EXAMPLE = JSON.stringify(
  { amount: 2400, currency: 'GBP', description: 'Conference tickets', submittedBy: 'alice' },
  null,
  2,
);

/**
 * How a process begins, and what it begins with.
 *
 * How it begins is saved as the settings the engine reads: a message name, a
 * signal name or a schedule (domain/startTrigger.ts). What is chosen here is
 * what happens.
 *
 * The sample data is the useful part. A process is a sequence of steps reading
 * and writing one bag of variables, and until the bag has something in it the
 * diagram cannot say what any step will see — so every question about data had
 * to be answered by starting a real instance and looking at it afterwards.
 *
 * What is typed here is not sent anywhere and does not change how the process
 * runs. It is what the panel traces through the diagram, so each step can show
 * the values it will be working with rather than a list of names.
 */
export function StartEventConfig({ data, onUpdate }: NodeConfigProps) {
  const sample = asText(data.sampleData);
  const invalid = sample.trim() !== '' && !isJSONObject(sample);
  const trigger = startTriggerOf(data);
  const schedule = scheduleOf(data);

  return (
    <Stack gap="xl">
      <PropertySection title="How it starts" hint="What causes a new run of this process to begin.">
        <Select
          aria-label="How this process starts"
          data={START_TRIGGERS.map(({ value, label }) => ({ value, label }))}
          value={trigger}
          onChange={(value) => value && onUpdate(chooseStartTrigger(value as StartTrigger, data))}
          allowDeselect={false}
        />
        <Text size="xs" c="dimmed">
          {START_TRIGGERS.find((choice) => choice.value === trigger)?.blurb}
        </Text>

        {trigger === 'message' && (
          <TextInput
            label="Message name"
            placeholder="e.g. order-placed"
            description="The name the sender uses. A message sent to one waiting process by its key does not start a new one."
            value={asText(data.messageName)}
            onChange={(event) => onUpdate({ messageName: event.currentTarget.value })}
            error={asText(data.messageName).trim() === '' ? 'Give the message a name, or nothing will start this process.' : undefined}
          />
        )}

        {trigger === 'signal' && (
          <TextInput
            label="Signal name"
            placeholder="e.g. day-closed"
            value={asText(data.signalName)}
            onChange={(event) => onUpdate({ signalName: event.currentTarget.value })}
            error={asText(data.signalName).trim() === '' ? 'Give the signal a name, or nothing will start this process.' : undefined}
          />
        )}

        {trigger === 'schedule' && schedule && (
          <>
            <StartScheduleEditor schedule={schedule} onChange={(next) => onUpdate({ start_schedule: next })} />
            <Text size="xs" c="dimmed">
              Only the live version runs on its schedule. A scheduled run starts with no data of its own.
            </Text>
          </>
        )}

        {trigger === 'schedule' && !schedule && (
          <Alert variant="light" color="red" p="xs" title="The schedule cannot be read">
            <Button
              size="compact-xs"
              variant="light"
              onClick={() => onUpdate({ start_schedule: defaultSchedule() })}
            >
              Choose when it runs again
            </Button>
          </Alert>
        )}
      </PropertySection>

      <PropertySection
        title="Sample data"
        hint="The data a process starts with. Used to show what each step will see — it is not sent anywhere and does not affect how the process runs."
      >
        <JsonInput
          placeholder={EXAMPLE}
          value={sample}
          onChange={(value) => onUpdate({ sampleData: value })}
          validationError="This is not valid JSON yet"
          formatOnBlur
          autosize
          minRows={6}
          error={invalid ? 'Sample data should be an object, like the example' : undefined}
        />

        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            Names here are the names steps read, so <Code>amount</Code> is what a decision looks up.
          </Text>
          {sample.trim() === '' && (
            <Button
              size="compact-xs"
              variant="light"
              leftSection={<Wand2 size={12} />}
              onClick={() => onUpdate({ sampleData: EXAMPLE })}
            >
              Use an example
            </Button>
          )}
        </Group>

        {sample.trim() !== '' && !invalid && (
          <Alert variant="light" color="teal" p="xs">
            <Text size="xs">
              Select any step to see what it receives and what it leaves behind.
            </Text>
          </Alert>
        )}
      </PropertySection>
    </Stack>
  );
}

function isJSONObject(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}
