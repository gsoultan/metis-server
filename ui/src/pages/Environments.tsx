import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Menu,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  ActionIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { CircleAlert, KeyRound, Link2, MoreHorizontal, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';

import { PageHeader } from '../components/PageHeader';
import {
  canAccept,
  givesTo,
  lastSeenLabel,
  normalCode,
  plausibleURL,
  purposeColor,
  purposeLabel,
  quiet,
  takesFrom,
  waitingForAcceptance,
  wordsLabel,
  type ConnectionCode,
  type ServerConnection,
  type ServerIdentity,
} from '../domain/serverConnections';
import { useServerConnectionActions, useServerConnections } from '../hooks/useServerConnections';
import { useTranslation } from '../i18n/context';
import { useAppStore } from '../store/useAppStore';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The servers this one takes releases from and gives them to, for a platform
 * administrator.
 *
 * A server before this one (Development, or Staging) makes a one-time code;
 * an administrator here types it with that server's address, both read the
 * same four words, and a second administrator here accepts. From then on
 * this server checks in every minute and collects what was sent to it, so a
 * Production on a private network needs no way in.
 */
export function Environments() {
  const { t } = useTranslation();
  const username = useAppStore((state) => state.user?.username);
  const { data, error, isLoading } = useServerConnections(true);
  const actions = useServerConnectionActions();
  const [code, setCode] = useState<ConnectionCode | null>(null);
  const [connecting, setConnecting] = useState(false);

  const run = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      notifications.show({ color: 'green', message: done });
    } catch (err) {
      notifications.show({ color: 'red', title: t('environments.failed'), message: errorMessage(err), autoClose: false });
    }
  };

  const makeCode = async () => {
    try {
      setCode(await actions.makeCode.mutateAsync());
    } catch (err) {
      notifications.show({ color: 'red', title: t('environments.failed'), message: errorMessage(err), autoClose: false });
    }
  };

  const server = data?.server;
  const connections = data?.connections ?? [];
  const upstream = connections.filter((c) => c.side === 'upstream');

  return (
    <Stack gap="xl">
      <PageHeader title={t('page.environments.title')} description={t('page.environments.subtitle')} />

      {error !== null && (
        <Alert color="red" icon={<CircleAlert size={18} />} title={t('environments.unreadable')}>
          {error.message}
        </Alert>
      )}
      {isLoading && <Text c="dimmed">{t('environments.loading')}</Text>}

      {server !== undefined && (
        <>
          <ThisServer
            server={server}
            onMakeCode={() => void makeCode()}
            making={actions.makeCode.isPending}
            onConnect={() => setConnecting(true)}
          />

          {server.trust_locked && (
            <Alert color="orange" icon={<KeyRound size={18} />} title={t('environments.trustLocked.title')}>
              {t('environments.trustLocked.body')}
            </Alert>
          )}

          {takesFrom(server.purpose).length > 0 && upstream.length === 0 && (
            <Alert color="yellow" icon={<CircleAlert size={18} />} title={t('environments.noUpstream.title')}>
              {t('environments.noUpstream.body', {
                purpose: purposeLabel(server.purpose),
                from: takesFrom(server.purpose).map(purposeLabel).join(t('environments.or')),
              })}
            </Alert>
          )}

          <Paper p="xl" radius="lg" withBorder shadow="sm">
            <Title order={4} mb="md">
              {t('environments.connected')}
            </Title>
            {connections.length === 0 ? (
              <Text c="dimmed">{t('environments.none')}</Text>
            ) : (
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('environments.column.environment')}</Table.Th>
                    <Table.Th>{t('environments.column.address')}</Table.Th>
                    <Table.Th>{t('environments.column.connection')}</Table.Th>
                    <Table.Th aria-label={t('environments.column.manage')} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {connections.map((c) => (
                    <ConnectionRow
                      key={c.id}
                      connection={c}
                      username={username}
                      onAccept={() => void run(() => actions.accept.mutateAsync(c.id), t('environments.accepted', { server: c.name }))}
                      onCollect={() =>
                        void run(() => actions.collectNow.mutateAsync(c.id), t('environments.checkedIn', { server: c.name }))
                      }
                      onRemove={() => void run(() => actions.remove.mutateAsync(c.id), t('environments.removed', { server: c.name }))}
                    />
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Paper>
        </>
      )}

      <CodeDialog code={code} onClose={() => setCode(null)} />
      <ConnectDialog
        opened={connecting}
        from={server !== undefined ? takesFrom(server.purpose) : []}
        onClose={() => setConnecting(false)}
        onConnect={(url, oneTimeCode) => actions.connect.mutateAsync({ url, code: oneTimeCode })}
      />
    </Stack>
  );
}

function ThisServer(props: {
  server: ServerIdentity;
  making: boolean;
  onMakeCode: () => void;
  onConnect: () => void;
}) {
  const { t } = useTranslation();
  const { server } = props;
  return (
    <Paper p="xl" radius="lg" withBorder shadow="sm">
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            {t('environments.thisServer')}
          </Text>
          <Group gap="sm">
            <Title order={3}>{server.name}</Title>
            <Badge color={purposeColor(server.purpose)} variant="filled">
              {purposeLabel(server.purpose)}
            </Badge>
          </Group>
          {server.url !== undefined && server.url !== '' && <Text size="sm">{server.url}</Text>}
          <Text size="xs" c="dimmed">
            {t('environments.key')} <Code>{server.key}</Code>
          </Text>
        </Stack>
        <Group>
          {takesFrom(server.purpose).length > 0 && (
            <Button leftSection={<Link2 size={16} />} onClick={props.onConnect}>
              {t('environments.connect.open')}
            </Button>
          )}
          {givesTo(server.purpose) && (
            <Button variant="light" leftSection={<KeyRound size={16} />} loading={props.making} onClick={props.onMakeCode}>
              {t('environments.code.make')}
            </Button>
          )}
        </Group>
      </Group>
    </Paper>
  );
}

function ConnectionRow(props: {
  connection: ServerConnection;
  username: string | undefined;
  onAccept: () => void;
  onCollect: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const c = props.connection;
  const now = new Date();
  const waiting = waitingForAcceptance(c);
  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs">
          <Badge color={purposeColor(c.purpose)} variant="light">
            {purposeLabel(c.purpose)}
          </Badge>
          <Text fw={500}>{c.name}</Text>
        </Group>
        <Text size="xs" c="dimmed">
          {c.side === 'upstream' ? t('environments.takesFrom') : t('environments.givesTo')}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{c.url ?? t('environments.noAddress')}</Text>
      </Table.Td>
      <Table.Td>
        {waiting ? (
          <Stack gap={4}>
            <Badge color="yellow" variant="light">
              {t('environments.needsSecond')}
            </Badge>
            <Text size="xs">
              {t('environments.words')} <b>{wordsLabel(c.words)}</b>
            </Text>
            <Text size="xs" c="dimmed">
              {t('environments.requestedBy', { name: c.requested_by })}
            </Text>
            {canAccept(c, props.username) ? (
              <Button size="xs" leftSection={<ShieldCheck size={14} />} onClick={props.onAccept} w="fit-content">
                {t('environments.accept')}
              </Button>
            ) : (
              <Text size="xs" c="dimmed">
                {t('environments.notYou')}
              </Text>
            )}
          </Stack>
        ) : (
          <Stack gap={2}>
            <Badge color={quiet(c.last_seen_at, now) ? 'orange' : 'green'} variant="light">
              {quiet(c.last_seen_at, now) ? t('environments.quiet') : t('environments.connectedBadge')}
            </Badge>
            <Text size="xs" c="dimmed">
              {lastSeenLabel(c.last_seen_at, now)}
            </Text>
          </Stack>
        )}
      </Table.Td>
      <Table.Td>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" aria-label={t('environments.column.manage')}>
              <MoreHorizontal size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {c.side === 'upstream' && !waiting && (
              <Menu.Item leftSection={<RefreshCw size={14} />} onClick={props.onCollect}>
                {t('environments.checkInNow')}
              </Menu.Item>
            )}
            <Menu.Item color="red" leftSection={<Trash2 size={14} />} onClick={props.onRemove}>
              {t('environments.remove')}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Table.Td>
    </Table.Tr>
  );
}

/** The one-time code, shown once, for the administrator of the next server to type. */
function CodeDialog({ code, onClose }: { code: ConnectionCode | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal opened={code !== null} onClose={onClose} title={t('environments.code.title')} centered>
      {code !== null && (
        <Stack>
          <Text size="sm">{t('environments.code.body')}</Text>
          <Text ff="monospace" fz={28} fw={700} ta="center" style={{ letterSpacing: 4 }}>
            {code.code}
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            {t('environments.code.expires', { at: new Date(code.expires_at).toLocaleTimeString() })}
          </Text>
          <Button onClick={onClose}>{t('environments.done')}</Button>
        </Stack>
      )}
    </Modal>
  );
}

/**
 * Connecting to the server before this one. The connection is made at once,
 * and the four words are then read out to the other side; a second
 * administrator here accepts only when they match.
 */
function ConnectDialog(props: {
  opened: boolean;
  from: ServerIdentity['purpose'][];
  onClose: () => void;
  onConnect: (url: string, code: string) => Promise<ServerConnection>;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [made, setMade] = useState<ServerConnection | null>(null);

  const close = () => {
    setUrl('');
    setCode('');
    setFailed(null);
    setMade(null);
    props.onClose();
  };

  const ready = plausibleURL(url) && normalCode(code).length >= 8;
  const submit = async () => {
    setBusy(true);
    setFailed(null);
    try {
      setMade(await props.onConnect(url.trim(), normalCode(code)));
    } catch (err) {
      setFailed(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={props.opened} onClose={close} title={t('environments.connect.title')} centered>
      {made === null ? (
        <Stack>
          <Text size="sm">
            {t('environments.connect.body', { from: props.from.map(purposeLabel).join(t('environments.or')) })}
          </Text>
          <TextInput
            label={t('environments.connect.url')}
            placeholder="https://dev.example.com"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            error={url !== '' && !plausibleURL(url) ? t('environments.connect.badUrl') : undefined}
          />
          <TextInput
            label={t('environments.connect.code')}
            value={code}
            onChange={(e) => setCode(e.currentTarget.value)}
            styles={{ input: { fontFamily: 'monospace', letterSpacing: 2 } }}
          />
          {failed !== null && (
            <Alert color="red" icon={<CircleAlert size={18} />}>
              {failed}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t('environments.cancel')}
            </Button>
            <Button disabled={!ready} loading={busy} onClick={() => void submit()}>
              {t('environments.connect.submit')}
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack>
          <Text size="sm">{t('environments.connect.compare', { server: made.name })}</Text>
          <Text fz={22} fw={700} ta="center">
            {wordsLabel(made.words)}
          </Text>
          <Alert color="yellow" icon={<ShieldCheck size={18} />}>
            {t('environments.connect.second')}
          </Alert>
          <Button onClick={close}>{t('environments.done')}</Button>
        </Stack>
      )}
    </Modal>
  );
}
