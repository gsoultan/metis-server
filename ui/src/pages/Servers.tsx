import { ActionIcon, Alert, Badge, Button, Code, Group, Paper, Stack, Table, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { CircleAlert, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '../components/PageHeader';
import { AddServerDialog } from '../components/servers/AddServerDialog';
import { MachineRole } from '../components/servers/MachineRole';
import { WaitingMachines } from '../components/servers/WaitingMachines';
import { waitingJoins } from '../domain/machineJoins';
import {
  durationLabel,
  machineStatus,
  missingWorkWarning,
  quietFor,
  statusColor,
  type Machine,
} from '../domain/machines';
import { useForgetMachine, useMachineJoins, useMachines } from '../hooks/useMachines';
import { PlatformAdminOnly } from '../components/access/PlatformAdminOnly';
import { platformAdminRefusal } from '../domain/platformAdmin';
import { useTranslation } from '../i18n/context';

/**
 * The machines running this server, for a platform administrator. They share
 * its database; each says every 15 seconds that it is running, and what it
 * runs. One that stopped is shown as it was, with how long it has been quiet,
 * and can be removed from the list.
 */
export function Servers() {
  const { t } = useTranslation();
  const { data, error, isLoading } = useMachines();
  const forget = useForgetMachine();
  const machines = data?.machines ?? [];
  const now = data?.now ?? new Date();
  const joins = useMachineJoins();
  const waiting = waitingJoins(joins.data?.joins ?? []);
  const [adding, setAdding] = useState(false);
  const refusal = platformAdminRefusal(error?.message);

  const remove = async (m: Machine) => {
    try {
      await forget.mutateAsync(m.id);
      notifications.show({ color: 'green', message: t('servers.removed', { name: m.name }) });
    } catch (err) {
      notifications.show({
        color: 'red',
        title: t('servers.failed'),
        message: err instanceof Error ? err.message : String(err),
        autoClose: false,
      });
    }
  };

  if (refusal !== null) {
    return (
      <Stack gap="xl">
        <PageHeader title={t('page.servers.title')} description={t('page.servers.subtitle')} />
        <PlatformAdminOnly refusal={refusal} />
      </Stack>
    );
  }

  return (
    <Stack gap="xl">
      <PageHeader
        title={t('page.servers.title')}
        description={t('page.servers.subtitle')}
        actions={
          <Button leftSection={<Plus size={16} />} onClick={() => setAdding(true)}>
            {t('servers.add.button')}
          </Button>
        }
      />
      <AddServerDialog opened={adding} onClose={() => setAdding(false)} />

      {waiting.length > 0 && <WaitingMachines joins={waiting} now={joins.data?.now ?? now} />}

      {error !== null && (
        <Alert color="red" icon={<CircleAlert size={18} />} title={t('servers.unreadable')}>
          {error.message}
        </Alert>
      )}
      {missingWorkWarning(machines, now) && (
        <Alert color="orange" icon={<CircleAlert size={18} />} title={t('servers.noWorker.title')}>
          {t('servers.noWorker.body')}
        </Alert>
      )}

      <Paper p="xl" radius="lg" withBorder shadow="sm">
        {isLoading ? (
          <Text c="dimmed">{t('servers.loading')}</Text>
        ) : machines.length === 0 ? (
          <Text c="dimmed">{t('servers.none')}</Text>
        ) : (
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('servers.column.server')}</Table.Th>
                <Table.Th>{t('servers.column.runs')}</Table.Th>
                <Table.Th>{t('servers.column.address')}</Table.Th>
                <Table.Th>{t('servers.column.status')}</Table.Th>
                <Table.Th>{t('servers.column.version')}</Table.Th>
                <Table.Th aria-label={t('servers.remove')} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {machines.map((m) => {
                const status = machineStatus(m, now);
                const quiet = durationLabel(quietFor(m, now));
                return (
                  <Table.Tr key={m.id}>
                    <Table.Td>
                      <Text fw={600}>{m.name}</Text>
                      <Text size="xs" c="dimmed">
                        {t('servers.startedAgo', { ago: durationLabel(Math.max(0, Math.round((now.getTime() - new Date(m.started_at).getTime()) / 1000))) })}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <MachineRole machine={m} machines={machines} now={now} />
                    </Table.Td>
                    <Table.Td>
                      <Code>{m.address || '—'}</Code>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <Badge size="xs" circle color={statusColor(status)} aria-hidden> </Badge>
                        <Text size="sm">
                          {status === 'running' ? t('servers.running') : t('servers.quiet', { ago: quiet })}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{m.version || '—'}</Text>
                    </Table.Td>
                    <Table.Td>
                      {status === 'stopped' && (
                        <Tooltip label={t('servers.remove')} withArrow>
                          <ActionIcon variant="subtle" color="red" aria-label={t('servers.remove')} onClick={() => void remove(m)}>
                            <Trash2 size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
