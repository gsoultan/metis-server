import {
  ActionIcon,
  Alert,
  Button,
  FileInput,
  Group,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { CheckCircle2, Database, FileUp, Globe, Plus, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import type { SourceKind } from '../../domain/participantImport';
import type { ImportCheck } from '../../domain/peopleImportCheck';
import { sourceIsReady, type SourceDraft } from '../../domain/peopleImportSource';
import classes from './PeopleImport.module.css';

interface SourceStepProps {
  draft: SourceDraft;
  onChange: (draft: SourceDraft) => void;
  /** Whether the caller may read a database: administrators and query authors. */
  allowDatabase: boolean;
  onTest: () => void;
  testing: boolean;
  /** What the last test found, for the source as it is now. `read` is -1 when not counted. */
  tested: ImportCheck | null;
  testError: string | null;
}

const SOURCES: Array<{ kind: SourceKind; title: string; description: string; icon: ReactNode }> = [
  { kind: 'csv', title: 'Upload a file', description: 'A CSV exported from a spreadsheet or HR system.', icon: <FileUp size={18} /> },
  { kind: 'http', title: 'API endpoint', description: 'A URL that returns your people as JSON.', icon: <Globe size={18} /> },
  { kind: 'postgres', title: 'Database query', description: 'A read-only SELECT against your own database.', icon: <Database size={18} /> },
];

/**
 * Step one: where the people come from, and proof it can be read.
 *
 * Cards rather than tabs, because the choice is the first decision of the
 * import, and each card says what it needs before it is picked.
 */
export function SourceStep({ draft, onChange, allowDatabase, onTest, testing, tested, testError }: SourceStepProps) {
  const set = (patch: Partial<SourceDraft>) => onChange({ ...draft, ...patch });
  const sources = SOURCES.filter((source) => source.kind !== 'postgres' || allowDatabase);

  return (
    <Stack gap="md">
      <div className={classes.sourceGrid} role="radiogroup" aria-label="Where your people come from">
        {sources.map((source) => (
          <UnstyledButton
            key={source.kind}
            className={classes.sourceCard}
            data-selected={draft.kind === source.kind || undefined}
            role="radio"
            aria-checked={draft.kind === source.kind}
            onClick={() => set({ kind: source.kind })}
          >
            <span className={classes.glyph} aria-hidden="true">{source.icon}</span>
            <Text fw={700} size="sm">{source.title}</Text>
            <Text size="xs" c="dimmed">{source.description}</Text>
          </UnstyledButton>
        ))}
      </div>

      <div className={classes.panel}>
        {draft.kind === 'csv' && (
          <FileInput
            label="CSV file"
            description="The first row names the columns. You match them to Metis's fields next."
            placeholder="Choose a file"
            accept=".csv,text/csv"
            value={draft.file}
            onChange={(file) => set({ file })}
            leftSection={<FileUp size={16} />}
            clearable
          />
        )}
        {draft.kind === 'http' && <EndpointFields draft={draft} set={set} />}
        {draft.kind === 'postgres' && <DatabaseFields draft={draft} set={set} />}
      </div>

      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <TestResult tested={tested} error={testError} kind={draft.kind} />
        <Button variant="default" onClick={onTest} loading={testing} disabled={!sourceIsReady(draft)}>
          {draft.kind === 'csv' ? 'Read file' : 'Test connection'}
        </Button>
      </Group>
    </Stack>
  );
}

type Setter = (patch: Partial<SourceDraft>) => void;

function EndpointFields({ draft, set }: { draft: SourceDraft; set: Setter }) {
  const setHeader = (index: number, patch: Partial<SourceDraft['headers'][number]>) =>
    set({ headers: draft.headers.map((header, i) => (i === index ? { ...header, ...patch } : header)) });

  return (
    <Stack gap="sm">
      <Group align="flex-end" wrap="nowrap" gap="sm">
        <SegmentedControl
          aria-label="Method"
          value={draft.method}
          onChange={(method) => set({ method: method as SourceDraft['method'] })}
          data={['GET', 'POST']}
        />
        <TextInput
          style={{ flex: 1 }}
          label="Endpoint"
          description="A JSON array, or an object with the list under data, items, results, users or participants"
          placeholder="https://hr.example.com/api/staff"
          value={draft.url}
          onChange={(e) => set({ url: e.currentTarget.value })}
        />
      </Group>
      {draft.headers.map((header, index) => (
        <Group key={index} gap="sm" wrap="nowrap" align="flex-end">
          <TextInput
            label={index === 0 ? 'Header' : undefined}
            aria-label="Header name"
            placeholder="Authorization"
            value={header.name}
            onChange={(e) => setHeader(index, { name: e.currentTarget.value })}
          />
          <PasswordInput
            style={{ flex: 1 }}
            label={index === 0 ? 'Value' : undefined}
            aria-label="Header value"
            placeholder="Bearer …"
            value={header.value}
            onChange={(e) => setHeader(index, { value: e.currentTarget.value })}
          />
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            aria-label="Remove header"
            onClick={() => set({ headers: draft.headers.filter((_, i) => i !== index) })}
          >
            <Trash2 size={16} />
          </ActionIcon>
        </Group>
      ))}
      <Group justify="space-between">
        <Button
          variant="subtle"
          size="xs"
          leftSection={<Plus size={14} />}
          onClick={() => set({ headers: [...draft.headers, { name: '', value: '' }] })}
        >
          Add header
        </Button>
        <Text size="xs" c="dimmed">Header values are used for this request and never shown again.</Text>
      </Group>
    </Stack>
  );
}

function DatabaseFields({ draft, set }: { draft: SourceDraft; set: Setter }) {
  return (
    <Stack gap="sm">
      <PasswordInput
        label="Connection string"
        description="Use a login that can only read the tables it needs."
        placeholder="postgres://reader:password@hr-db:5432/hr"
        value={draft.dsn}
        onChange={(e) => set({ dsn: e.currentTarget.value })}
      />
      <Textarea
        label="Query"
        description="Any column names. You match them to Metis's fields next."
        placeholder={'SELECT id, login, full_name, work_email\nFROM staff\nWHERE is_current'}
        autosize
        minRows={4}
        value={draft.query}
        onChange={(e) => set({ query: e.currentTarget.value })}
        styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
      />
      <Group gap={6} wrap="nowrap">
        <ShieldCheck size={14} color="var(--mantine-color-dimmed)" aria-hidden="true" />
        <Text size="xs" c="dimmed">
          Runs as one statement in a read-only transaction, stopped after 30 seconds. Metis's own database is refused.
        </Text>
      </Group>
    </Stack>
  );
}

function TestResult({ tested, error, kind }: { tested: ImportCheck | null; error: string | null; kind: SourceKind }) {
  if (error) {
    return (
      <Alert color="red" variant="light" radius="md" icon={<XCircle size={16} />} style={{ flex: 1 }} title="Could not read the source">
        <Text size="sm">{error}</Text>
      </Alert>
    );
  }
  if (!tested) {
    return (
      <Text size="sm" c="dimmed" style={{ flex: 1 }}>
        {kind === 'csv' ? 'Nothing is imported until you have checked the rows.' : 'Test the connection to see the fields it returns. Nothing is imported yet.'}
      </Text>
    );
  }
  return (
    <Alert color="teal" variant="light" radius="md" icon={<CheckCircle2 size={16} />} style={{ flex: 1 }} title={tested.read < 0 ? 'Found the columns' : `Read ${tested.read.toLocaleString()} ${tested.read === 1 ? 'row' : 'rows'}`}>
      <Text size="sm">
        {tested.fields.length} {tested.fields.length === 1 ? 'field' : 'fields'}: {tested.fields.slice(0, 8).join(', ')}
        {tested.fields.length > 8 ? ', …' : ''}
      </Text>
    </Alert>
  );
}
