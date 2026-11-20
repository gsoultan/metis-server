import {
  ActionIcon,
  Badge,
  Button,
  Card,
  FileInput,
  Group,
  Menu,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Download, FileCheck, MoreHorizontal, PackageCheck } from 'lucide-react';
import { useState } from 'react';

import { PageHeader, PageShell } from '../components/layout';
import { EmptyState, ErrorState, TableLoadingState } from '../components/state';
import {
  MAX_LIVE_NOTE_BYTES,
  MAX_RELEASE_FILE_BYTES,
  OWN_RUNTIME_ID,
  canRollBack,
  liveNoteFileName,
  parseJSONFile,
  parseKeys,
  releaseFileName,
  releaseActions,
  releaseStateColor,
  runtimeLabel,
  type Release,
} from '../domain/release';
import { useReleaseActions, useReleases, useRuntime } from '../hooks/useReleases';
import { useTranslation } from '../i18n/context';
import { releaseService } from '../services/domains/releaseService';
import { errorMessage } from '../services/shared/errors';
import { saveJSONFile } from '../services/shared/saveFile';
import { useAppStore } from '../store/useAppStore';

const COLUMNS = 6;

/**
 * The project's releases in the environment the page is served from: cut
 * them where they were tested, import them into the next environment, and
 * make them live there together.
 */
export function ReleaseList() {
  const { t } = useTranslation();
  const releases = useReleases();
  const runtime = useRuntime();
  const actions = useReleaseActions();
  const [cutting, setCutting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [noting, setNoting] = useState<string | null>(null);
  const projectId = useAppStore((state) => state.currentProjectId) ?? '';
  const protectedRuntime = runtime.data?.current.protected ?? true;
  const rows = releases.data ?? [];

  const run = async (label: string, work: () => Promise<Release>) => {
    try {
      const release = await work();
      notifications.show({ color: 'green', title: label, message: release.name });
      return true;
    } catch (err) {
      notifications.show({ color: 'red', title: t('releases.failed'), message: errorMessage(err), autoClose: false });
      return false;
    }
  };

  // A file is fetched when asked for, not with the list: a release file
  // carries every model in it, and a signature is made on each request.
  const save = async (fetch: () => Promise<unknown>, fileName: string) => {
    try {
      const value = await fetch();
      if (value === undefined || value === null) throw new Error(t('releases.file.empty'));
      saveJSONFile(value, fileName);
    } catch (err) {
      notifications.show({ color: 'red', title: t('releases.failed'), message: errorMessage(err), autoClose: false });
    }
  };

  return (
    <PageShell>
      <PageHeader
        title={t('page.releases.title')}
        description={t('page.releases.subtitle')}
        actions={
          <Group gap="xs">
            <Button variant="default" onClick={() => setImporting(true)}>
              {t('releases.import')}
            </Button>
            <Button variant="default" onClick={() => setCutting(true)}>
              {t('releases.cut')}
            </Button>
            {canRollBack(rows) && (
              <Button
                color="orange"
                variant="light"
                loading={actions.rollBack.isPending}
                onClick={() => void run(t('releases.rolledBack'), () => actions.rollBack.mutateAsync())}
              >
                {t('releases.rollBack')}
              </Button>
            )}
          </Group>
        }
      />
      <Card withBorder radius="lg" p={0} mt="lg">
        {releases.isLoading ? (
          <TableLoadingState columns={COLUMNS} />
        ) : releases.error ? (
          <ErrorState error={releases.error} action={t('releases.loadAction')} onRetry={() => void releases.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={PackageCheck} title={t('releases.empty.title')} description={t('releases.empty.description')} />
        ) : (
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('releases.column.name')}</Table.Th>
                <Table.Th>{t('releases.column.state')}</Table.Th>
                <Table.Th>{t('releases.column.models')}</Table.Th>
                <Table.Th>{t('releases.column.people')}</Table.Th>
                <Table.Th>{t('releases.column.live')}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((release) => {
                const can = releaseActions(release, protectedRuntime);
                return (
                  <Table.Tr key={release.id}>
                    <Table.Td>
                      <Text fw={600}>{release.name}</Text>
                      <Text size="xs" c="dimmed" ff="monospace">
                        {release.hash.slice(0, 12)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={releaseStateColor(release.state)} variant="light">
                        {t(`releases.state.${release.state}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {release.items.map((item) => `${item.key}${item.version ? ` v${item.version}` : ''}`).join(', ')}
                      </Text>
                      {release.connections.length > 0 && (
                        <Text size="xs" c="dimmed">
                          {t('releases.connections', { names: release.connections.join(', ') })}
                        </Text>
                      )}
                      {release.checked && (
                        <Text size="xs" c="dimmed">
                          {t('releases.checked', {
                            tests: release.checked.decision_tests,
                            cases: release.checked.simulation_cases,
                          })}
                        </Text>
                      )}
                      {release.live_note && (
                        <Badge mt={4} size="sm" variant="light" color="green" leftSection={<FileCheck size={12} />}>
                          {t('releases.liveNote.carried', { when: new Date(release.live_note.live_at).toLocaleString() })}
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">{t('releases.cutBy', { name: release.cut_by })}</Text>
                      {release.imported_by && <Text size="xs">{t('releases.importedBy', { name: release.imported_by })}</Text>}
                      {release.approved_by && <Text size="xs">{t('releases.approvedBy', { name: release.approved_by })}</Text>}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{release.live_at ? new Date(release.live_at).toLocaleString() : '—'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" justify="flex-end" wrap="nowrap">
                        {can.attachLiveNote && (
                          <Button size="xs" variant="default" onClick={() => setNoting(release.name)}>
                            {t('releases.liveNote.attach')}
                          </Button>
                        )}
                        {can.approve && (
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => void run(t('releases.approved'), () => actions.approve.mutateAsync(release.name))}
                          >
                            {t('releases.approve')}
                          </Button>
                        )}
                        {can.goLive && (
                          <Button
                            size="xs"
                            color={protectedRuntime ? 'red' : undefined}
                            loading={actions.goLive.isPending && actions.goLive.variables === release.name}
                            onClick={() => void run(t('releases.wentLive'), () => actions.goLive.mutateAsync(release.name))}
                          >
                            {t('releases.goLive')}
                          </Button>
                        )}
                        <Menu position="bottom-end" shadow="md" width={240}>
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray" aria-label={t('releases.more', { name: release.name })}>
                              <MoreHorizontal size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            {can.download && (
                              <Menu.Item
                                leftSection={<Download size={14} />}
                                onClick={() =>
                                  void save(() => releaseService.exportFile(projectId, release.name), releaseFileName(release.name))
                                }
                              >
                                {t('releases.file.download')}
                              </Menu.Item>
                            )}
                            {can.downloadLiveNote && (
                              <Menu.Item
                                leftSection={<FileCheck size={14} />}
                                onClick={() =>
                                  void save(() => releaseService.liveNote(projectId, release.name), liveNoteFileName(release.name))
                                }
                              >
                                {t('releases.liveNote.download')}
                              </Menu.Item>
                            )}
                          </Menu.Dropdown>
                        </Menu>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <CutDialog
        opened={cutting}
        onClose={() => setCutting(false)}
        onCut={async (name, processes) => {
          if (await run(t('releases.wasCut'), () => actions.cut.mutateAsync({ name, processes, decisions: [] }))) setCutting(false);
        }}
        pending={actions.cut.isPending}
      />
      <ImportDialog
        opened={importing}
        onClose={() => setImporting(false)}
        sources={(runtime.data?.environments ?? []).filter((env) => env.id !== runtime.data?.current.id)}
        includeOwn={Boolean(runtime.data?.current.id)}
        onImport={async (fromEnvironment, name) => {
          if (await run(t('releases.imported'), () => actions.importFrom.mutateAsync({ fromEnvironment, name }))) setImporting(false);
        }}
        onImportFile={async (file) => {
          if (await run(t('releases.imported'), () => actions.importFile.mutateAsync(file))) setImporting(false);
        }}
        pending={actions.importFrom.isPending || actions.importFile.isPending}
      />
      <LiveNoteDialog
        release={noting}
        onClose={() => setNoting(null)}
        onAttach={async (name, note) => {
          if (await run(t('releases.liveNote.attached'), () => actions.attachLiveNote.mutateAsync({ name, note }))) setNoting(null);
        }}
        pending={actions.attachLiveNote.isPending}
      />
    </PageShell>
  );
}

function CutDialog(props: {
  opened: boolean;
  onClose: () => void;
  onCut: (name: string, processes: string[]) => Promise<void>;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [keys, setKeys] = useState('');
  const processes = parseKeys(keys);
  return (
    <Modal opened={props.opened} onClose={props.onClose} title={t('releases.cut')}>
      <Stack>
        <Text size="sm" c="dimmed">
          {t('releases.cutHelp')}
        </Text>
        <TextInput label={t('releases.name')} placeholder="2026.11.1" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
        <Textarea
          label={t('releases.processes')}
          description={t('releases.processesHelp')}
          placeholder="claims, onboarding"
          value={keys}
          onChange={(e) => setKeys(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Group justify="flex-end">
          <Button
            disabled={!name.trim() || processes.length === 0}
            loading={props.pending}
            onClick={() => void props.onCut(name.trim(), processes)}
          >
            {t('releases.cut')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ImportDialog(props: {
  opened: boolean;
  onClose: () => void;
  sources: Array<{ id: string; name: string; protected: boolean }>;
  includeOwn: boolean;
  onImport: (fromEnvironment: string, name: string) => Promise<void>;
  onImportFile: (file: unknown) => Promise<void>;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState<'environment' | 'file'>('environment');
  const own = t('releases.ownRuntime');
  const choices = [
    ...(props.includeOwn ? [{ value: OWN_RUNTIME_ID, label: own }] : []),
    ...props.sources.map((env) => ({ value: env.id, label: runtimeLabel(env, own) })),
  ];
  const [from, setFrom] = useState<string | null>(null);
  const [name, setName] = useState('');
  return (
    <Modal opened={props.opened} onClose={props.onClose} title={t('releases.import')}>
      <Stack>
        <SegmentedControl
          fullWidth
          value={source}
          onChange={(value) => setSource(value === 'file' ? 'file' : 'environment')}
          data={[
            { value: 'environment', label: t('releases.importFrom.environment') },
            { value: 'file', label: t('releases.importFrom.file') },
          ]}
        />
        {source === 'environment' ? (
          <>
            <Text size="sm" c="dimmed">
              {t('releases.importHelp')}
            </Text>
            <Select label={t('releases.from')} data={choices} value={from} onChange={setFrom} required />
            <TextInput label={t('releases.name')} placeholder="2026.11.1" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
            <Group justify="flex-end">
              <Button
                disabled={!from || !name.trim()}
                loading={props.pending}
                onClick={() => void props.onImport(from === OWN_RUNTIME_ID ? '' : (from ?? ''), name.trim())}
              >
                {t('releases.import')}
              </Button>
            </Group>
          </>
        ) : (
          <JSONFilePicker
            help={t('releases.file.importHelp')}
            label={t('releases.file.label')}
            limit={MAX_RELEASE_FILE_BYTES}
            action={t('releases.import')}
            pending={props.pending}
            onPick={props.onImportFile}
          />
        )}
      </Stack>
    </Modal>
  );
}

function LiveNoteDialog(props: {
  release: string | null;
  onClose: () => void;
  onAttach: (name: string, note: unknown) => Promise<void>;
  pending: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Modal opened={props.release !== null} onClose={props.onClose} title={t('releases.liveNote.attach')}>
      {props.release !== null && (
        <JSONFilePicker
          key={props.release}
          help={t('releases.liveNote.attachHelp', { name: props.release })}
          label={t('releases.liveNote.label')}
          limit={MAX_LIVE_NOTE_BYTES}
          action={t('releases.liveNote.attach')}
          pending={props.pending}
          onPick={(note) => props.onAttach(props.release ?? '', note)}
        />
      )}
    </Modal>
  );
}

/**
 * Chooses a JSON file and reads it. A file that is too large or is not JSON
 * is refused here; whether it is signed and whole is for the engine to say.
 */
function JSONFilePicker(props: {
  help: string;
  label: string;
  limit: number;
  action: string;
  pending: boolean;
  onPick: (value: unknown) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [value, setValue] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);

  const choose = async (chosen: File | null) => {
    setFile(chosen);
    setValue(undefined);
    setError(null);
    if (!chosen) return;
    const read = parseJSONFile(chosen.size > props.limit ? '' : await chosen.text(), chosen.size, props.limit);
    if (read.error) {
      setError(t(`releases.file.${read.error}`));
      return;
    }
    setValue(read.value);
  };

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {props.help}
      </Text>
      <FileInput
        label={props.label}
        accept="application/json,.json"
        placeholder={t('releases.file.choose')}
        leftSection={<FileCheck size={16} />}
        value={file}
        onChange={(chosen) => void choose(chosen)}
        error={error}
        clearable
        required
      />
      <Group justify="flex-end">
        <Button disabled={value === undefined} loading={props.pending} onClick={() => void props.onPick(value)}>
          {props.action}
        </Button>
      </Group>
    </Stack>
  );
}
