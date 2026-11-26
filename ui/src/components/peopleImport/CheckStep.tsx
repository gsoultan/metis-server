import { Alert, Badge, Button, Checkbox, Group, SegmentedControl, Stack, Table, Text, TextInput } from '@mantine/core';
import { AlertTriangle, Download, Search } from 'lucide-react';
import { useState, useTransition } from 'react';

import {
  OUTCOME_LABELS,
  countOf,
  openTasksOnRenames,
  refusedCount,
  refusedRowsCsv,
  visibleRows,
  type ImportCheck,
  type Outcome,
} from '../../domain/peopleImportCheck';
import classes from './PeopleImport.module.css';

interface CheckStepProps {
  check: ImportCheck;
  moveOpenTasks: boolean;
  onMoveOpenTasks: (move: boolean) => void;
}

type Filter = Outcome | 'all' | 'refused';

/** Rows drawn at once. The counts above the table always cover every row. */
const SHOWN = 200;

const STAT_ORDER: Outcome[] = ['new', 'update', 'linked', 'renamed', 'unchanged'];

/**
 * Step three: what importing would do, row by row, before anything is written.
 *
 * Refused rows are counted apart and can be downloaded, because they go back to
 * whoever owns the source; the rest of the import does not wait for them.
 */
export function CheckStep({ check, moveOpenTasks, onMoveOpenTasks }: CheckStepProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [shownSearch, setShownSearch] = useState('');
  const [, startTransition] = useTransition();
  const refused = refusedCount(check);
  const openTasks = openTasksOnRenames(check);
  const rows = visibleRows(check.rows, filter, shownSearch);

  const download = () => {
    const blob = new Blob([refusedRowsCsv(check.rows)], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'people-not-imported.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <Stack gap="md">
      <div className={classes.stats}>
        {STAT_ORDER.map((outcome) => (
          <Stat key={outcome} label={OUTCOME_LABELS[outcome].label} value={countOf(check, outcome)} colour={OUTCOME_LABELS[outcome].colour} />
        ))}
        <Stat label="Refused" value={refused} colour={refused > 0 ? 'red' : 'gray'} />
      </div>

      {countOf(check, 'renamed') > 0 && (
        <Alert color="violet" variant="light" radius="md" icon={<AlertTriangle size={16} />} title="Some people were renamed in your application">
          <Stack gap="xs">
            <Text size="sm">
              {openTasks > 0
                ? `Their old usernames have ${openTasks} open ${openTasks === 1 ? 'task' : 'tasks'}. Tasks name people by username, so they stay with the old name unless you move them.`
                : 'None of them has open tasks, so the rename moves nothing.'}
            </Text>
            {openTasks > 0 && (
              <Checkbox
                label="Move their open tasks to the new usernames"
                description="In the same transaction as the rename. Without it, those renames are skipped."
                checked={moveOpenTasks}
                onChange={(e) => onMoveOpenTasks(e.currentTarget.checked)}
              />
            )}
          </Stack>
        </Alert>
      )}

      <Group justify="space-between" gap="sm">
        <SegmentedControl
          size="xs"
          aria-label="Show rows"
          value={filter}
          onChange={(value) => setFilter(value as Filter)}
          data={[
            { value: 'all', label: `All ${check.read.toLocaleString()}` },
            { value: 'new', label: 'New' },
            { value: 'update', label: 'Update' },
            { value: 'renamed', label: 'Renamed' },
            { value: 'refused', label: `Refused ${refused}` },
          ]}
        />
        <Group gap="xs">
          <TextInput
            size="xs"
            aria-label="Search rows"
            placeholder="Search name, ID or email"
            leftSection={<Search size={14} />}
            value={search}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setSearch(value);
              startTransition(() => setShownSearch(value));
            }}
          />
          <Button size="xs" variant="default" leftSection={<Download size={14} />} onClick={download} disabled={refused === 0}>
            Refused rows
          </Button>
        </Group>
      </Group>

      <div className={classes.tableWrap}>
        <Table stickyHeader striped highlightOnHover verticalSpacing={6} fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={60}>Line</Table.Th>
              <Table.Th w={130}>Result</Table.Th>
              <Table.Th>Username</Table.Th>
              <Table.Th>External ID</Table.Th>
              <Table.Th>What happens</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.slice(0, SHOWN).map((row) => (
              <Table.Tr key={`${row.line}-${row.outcome}`}>
                <Table.Td c="dimmed" ff="monospace">{row.line}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={OUTCOME_LABELS[row.outcome]?.colour ?? 'gray'} styles={{ label: { overflow: 'visible' } }} title={OUTCOME_LABELS[row.outcome]?.hint}>
                    {OUTCOME_LABELS[row.outcome]?.label ?? row.outcome}
                  </Badge>
                </Table.Td>
                <Table.Td fw={600}>{row.username || '—'}</Table.Td>
                <Table.Td ff="monospace">{row.external_id || '—'}</Table.Td>
                <Table.Td c={row.outcome === 'invalid' || row.outcome === 'conflict' ? 'red' : 'dimmed'}>
                  {row.detail || (row.display_name ? `${row.display_name}${row.email ? `, ${row.email}` : ''}` : '')}
                </Table.Td>
              </Table.Tr>
            ))}
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text size="sm" c="dimmed" ta="center" py="md">No rows match.</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </div>
      {(rows.length > SHOWN || check.truncated === true) && (
        <Text size="xs" c="dimmed">
          Showing the first {Math.min(rows.length, SHOWN)} rows. Search or filter to find others; the totals above count every row.
        </Text>
      )}
    </Stack>
  );
}

function Stat({ label, value, colour }: { label: string; value: number; colour: string }) {
  return (
    <div className={classes.stat}>
      <Text size="xs" c="dimmed" fw={600}>{label}</Text>
      <Text size="xl" fw={800} c={value > 0 ? `${colour}.7` : 'dimmed'}>{value.toLocaleString()}</Text>
    </div>
  );
}
