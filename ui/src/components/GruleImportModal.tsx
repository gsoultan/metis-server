import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Code,
  FileInput,
  Group,
  List,
  Modal,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { AlertTriangle, CheckCircle2, FileUp, Upload } from 'lucide-react';
import { useState } from 'react';

import {
  fileProblems,
  isImportKey,
  keyFromFileName,
  reportHeadline,
  splitOutcomes,
  type GruleImportReport,
  type RuleFile,
} from '../domain/gruleImport';
import { errorMessage } from '../services/shared/errors';
import { useImportGruleRules } from '../hooks/useDecisions';

interface GruleImportModalProps {
  opened: boolean;
  onClose: () => void;
  /** Called once the tables are stored, with the process when it was deployed. */
  onImported: (report: GruleImportReport) => void;
}

/**
 * Bringing a Grule rule set in.
 *
 * Two steps, because the rule set is somebody else's program: first the
 * engine reads it and says, rule by rule, what it would make and what it
 * would leave out, and stores nothing. Only then is the import offered. A
 * change to the files or the key takes the report away, so what is imported
 * is always what was checked.
 */
export function GruleImportModal({ opened, onClose, onImported }: GruleImportModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [deploy, setDeploy] = useState(true);
  const [report, setReport] = useState<GruleImportReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const importRules = useImportGruleRules();

  const problems = fileProblems(files);
  const keyValid = isImportKey(key);
  const ready = files.length > 0 && problems.length === 0 && keyValid;

  const reset = () => {
    setReport(null);
    setFailure(null);
  };

  const close = () => {
    setFiles([]);
    setKey('');
    setName('');
    setDeploy(true);
    reset();
    onClose();
  };

  const chooseFiles = (chosen: File[]) => {
    setFiles(chosen);
    if (!key && chosen[0]) setKey(keyFromFileName(chosen[0].name));
    reset();
  };

  const send = async (preview: boolean) => {
    setFailure(null);
    try {
      const read: RuleFile[] = await Promise.all(
        files.map(async (file) => ({ name: file.name, content: await file.text() })),
      );
      const result = await importRules.mutateAsync({ key, name: name.trim(), files: read, preview, deploy });
      if (preview) {
        setReport(result);
        return;
      }
      onImported(result);
      close();
    } catch (error) {
      setFailure(errorMessage(error, 'The rules could not be imported.'));
    }
  };

  const { translated, skipped } = splitOutcomes(report?.rules);
  const nothingToImport = report !== null && (report.decisions?.length ?? 0) === 0;

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={<Group gap="xs"><Upload size={20} /><Text fw={800}>Import Grule rules</Text></Group>}
      size="xl"
      radius="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Rules from <Code>.grl</Code> files, or Grule&apos;s JSON rules, become decision tables, and a
          process that runs them in the order Grule would fire them. Nothing is stored until you
          have seen what each rule becomes.
        </Text>

        <FileInput
          label="Rule files"
          placeholder="Choose .grl or .json files"
          accept=".grl,.json,application/json"
          multiple
          clearable
          value={files}
          onChange={chooseFiles}
          leftSection={<FileUp size={16} />}
        />
        {problems.length > 0 && (
          <Alert color="red" icon={<AlertTriangle size={16} />} title="These files cannot be sent">
            <List size="sm">{problems.map((p) => <List.Item key={p}>{p}</List.Item>)}</List>
          </Alert>
        )}

        <Group grow align="flex-start">
          <TextInput
            label="Key"
            description="Names the tables and the process"
            value={key}
            onChange={(e) => { setKey(e.currentTarget.value); reset(); }}
            error={key && !keyValid ? 'Lowercase letters, digits and dashes, starting with a letter' : undefined}
          />
          <TextInput
            label="Process name"
            description="Optional"
            placeholder={key || 'Loan rules'}
            value={name}
            onChange={(e) => { setName(e.currentTarget.value); reset(); }}
          />
        </Group>

        {failure && (
          <Alert color="red" icon={<AlertTriangle size={16} />} title="Not imported">
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{failure}</Text>
          </Alert>
        )}

        {report && (
          <Stack gap="sm">
            <Group gap="xs">
              <CheckCircle2 size={18} color={nothingToImport ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-teal-6)'} />
              <Text fw={700}>{reportHeadline(report)}</Text>
            </Group>

            {(report.warnings?.length ?? 0) > 0 && (
              <Alert color="yellow" icon={<AlertTriangle size={16} />} title="Worth checking">
                <List size="sm">{report.warnings!.map((w) => <List.Item key={w}>{w}</List.Item>)}</List>
              </Alert>
            )}

            <ScrollArea.Autosize mah={280}>
              <Table verticalSpacing="xs" fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Rule</Table.Th>
                    <Table.Th>Where</Table.Th>
                    <Table.Th>Becomes</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {[...translated, ...skipped].map((rule) => (
                    <Table.Tr key={`${rule.position}-${rule.name}`}>
                      <Table.Td><Text size="sm" fw={600}>{rule.name}</Text></Table.Td>
                      <Table.Td><Text size="xs" c="dimmed">{rule.position}</Text></Table.Td>
                      <Table.Td>
                        {rule.decision ? (
                          <Stack gap={2}>
                            <Badge variant="light" color="teal" styles={{ label: { textTransform: 'none' } }}>
                              {rule.decision}
                            </Badge>
                            {rule.notes?.map((note) => <Text key={note} size="xs" c="dimmed">{note}</Text>)}
                          </Stack>
                        ) : (
                          <Stack gap={2}>
                            <Badge variant="light" color="red" styles={{ label: { textTransform: 'none' } }}>Left out</Badge>
                            <Text size="xs">{rule.reason}</Text>
                          </Stack>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>

            {report.results && Object.keys(report.results).length > 0 && (
              <Text size="xs" c="dimmed">
                Results are written to{' '}
                {Object.entries(report.results).map(([field, variable], i) => (
                  <span key={field}>{i > 0 && ', '}<Code>{field}</Code> → <Code>{variable}</Code></span>
                ))}.
              </Text>
            )}

            {!nothingToImport && (
              <Checkbox
                label="Also deploy the process that runs the tables"
                checked={deploy}
                onChange={(e) => setDeploy(e.currentTarget.checked)}
              />
            )}
          </Stack>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={close}>Cancel</Button>
          {report && !nothingToImport ? (
            <Button loading={importRules.isPending} disabled={!ready} onClick={() => send(false)}>
              {deploy ? 'Import and deploy' : 'Import tables'}
            </Button>
          ) : (
            <Button loading={importRules.isPending} disabled={!ready} onClick={() => send(true)}>
              Check rules
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
