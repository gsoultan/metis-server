import { Alert, Chip, Group, List, NumberInput, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';

import {
  MAX_INTERVAL_MINUTES,
  SCHEDULE_DAYS,
  describeSchedule,
  formatRun,
  nextRuns,
  scheduleProblems,
  tidySchedule,
  timeZoneChoices,
  type ScheduleDay,
  type ScheduleEvery,
  type StartSchedule,
} from '../../domain/startSchedule';

const RULES: { value: ScheduleEvery; label: string }[] = [
  { value: 'interval', label: 'Every few minutes, hours or days' },
  { value: 'day', label: 'Every day' },
  { value: 'weekday', label: 'Every weekday (Monday to Friday)' },
  { value: 'week', label: 'On chosen days of the week' },
  { value: 'month', label: 'Every month' },
];

type IntervalUnit = 'minutes' | 'hours' | 'days';

const UNIT_MINUTES: Record<IntervalUnit, number> = { minutes: 1, hours: 60, days: 24 * 60 };

/** The largest unit the interval is a whole number of, which is how it was typed. */
function unitOf(minutes: number): IntervalUnit {
  if (minutes > 0 && minutes % UNIT_MINUTES.days === 0) return 'days';
  if (minutes > 0 && minutes % UNIT_MINUTES.hours === 0) return 'hours';
  return 'minutes';
}

/** How many run times the panel names. */
const SHOWN_RUNS = 3;

interface StartScheduleEditorProps {
  schedule: StartSchedule;
  onChange: (schedule: StartSchedule) => void;
  /** The moment "next" is counted from. Passed in so a test can fix it. */
  now?: Date;
}

/**
 * When a process starts by itself, as plain choices.
 *
 * No cron syntax: each field is one of the choices the engine accepts, so
 * what can be picked here is what can be deployed. Under the fields the panel
 * names the next run times on the schedule's own clock, which is the check
 * that matters: a schedule reads as right until the times are written out.
 */
export function StartScheduleEditor({ schedule, onChange, now }: StartScheduleEditorProps) {
  const change = (patch: Partial<StartSchedule>) => onChange(tidySchedule({ ...schedule, ...patch }));
  const problems = scheduleProblems(schedule);
  const runs = problems.length === 0 ? nextRuns(schedule, now ?? new Date(), SHOWN_RUNS) : [];

  const minutes = schedule.interval_minutes ?? 60;
  const unit = unitOf(minutes);

  return (
    <Stack gap="sm">
      <Select
        label="Runs"
        data={RULES}
        value={schedule.every}
        onChange={(value) => value && change({ every: value as ScheduleEvery })}
        allowDeselect={false}
      />

      {schedule.every === 'interval' && (
        <Group grow align="flex-end">
          <NumberInput
            label="Every"
            min={1}
            max={MAX_INTERVAL_MINUTES / UNIT_MINUTES[unit]}
            allowDecimal={false}
            allowNegative={false}
            value={minutes / UNIT_MINUTES[unit]}
            onChange={(value) => change({ interval_minutes: (Number(value) || 0) * UNIT_MINUTES[unit] })}
          />
          <Select
            aria-label="Unit of time"
            data={[
              { value: 'minutes', label: 'minutes' },
              { value: 'hours', label: 'hours' },
              { value: 'days', label: 'days' },
            ]}
            value={unit}
            onChange={(value) =>
              value && change({ interval_minutes: (minutes / UNIT_MINUTES[unit]) * UNIT_MINUTES[value as IntervalUnit] })
            }
            allowDeselect={false}
          />
        </Group>
      )}

      {schedule.every === 'week' && (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            On
          </Text>
          <Chip.Group
            multiple
            value={schedule.days ?? []}
            onChange={(days) => change({ days: days as ScheduleDay[] })}
          >
            <Group gap={6}>
              {SCHEDULE_DAYS.map((day) => (
                <Chip key={day.value} value={day.value} size="xs" aria-label={day.label}>
                  {day.short}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </Stack>
      )}

      {schedule.every === 'month' && (
        <NumberInput
          label="On day"
          description="In a month too short for it, it runs on the last day."
          min={1}
          max={31}
          allowDecimal={false}
          allowNegative={false}
          value={schedule.day_of_month ?? 1}
          onChange={(value) => change({ day_of_month: Number(value) || 0 })}
        />
      )}

      {schedule.every !== 'interval' && (
        <TextInput
          label="At"
          type="time"
          value={schedule.at ?? ''}
          onChange={(event) => change({ at: event.currentTarget.value })}
        />
      )}

      <Select
        label="Time zone"
        description="The clock the times above are read on."
        data={timeZoneChoices()}
        value={schedule.time_zone}
        onChange={(value) => value && change({ time_zone: value })}
        searchable
        allowDeselect={false}
        nothingFoundMessage="No zone by that name"
      />

      <SimpleGrid cols={2}>
        <TextInput
          label="First date"
          description="Optional"
          type="date"
          value={schedule.from ?? ''}
          onChange={(event) => change({ from: event.currentTarget.value || undefined })}
        />
        <TextInput
          label="Last date"
          description="Optional"
          type="date"
          value={schedule.until ?? ''}
          onChange={(event) => change({ until: event.currentTarget.value || undefined })}
        />
      </SimpleGrid>

      {problems.length > 0 ? (
        <Alert variant="light" color="red" p="xs" title="This schedule cannot run yet">
          <Text size="xs">{problems[0]}</Text>
        </Alert>
      ) : (
        <Alert variant="light" color="teal" p="xs" title={describeSchedule(schedule)}>
          {runs.length > 0 ? (
            <>
              <Text size="xs">Next runs, on the {schedule.time_zone} clock:</Text>
              <List size="xs" aria-label="Next runs">
                {runs.map((run) => (
                  <List.Item key={run.getTime()}>{formatRun(run, schedule.time_zone)}</List.Item>
                ))}
              </List>
            </>
          ) : (
            <Text size="xs">Its last date has passed, so it will not run again.</Text>
          )}
        </Alert>
      )}
    </Stack>
  );
}
