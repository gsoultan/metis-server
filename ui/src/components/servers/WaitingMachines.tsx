import { Button, Code, Group, Paper, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';

import { waitingFor, type MachineJoin } from '../../domain/machineJoins';
import { durationLabel, roleLabel } from '../../domain/machines';
import { useAcceptMachineJoin, useRemoveMachineJoin } from '../../hooks/useMachines';
import { useTranslation } from '../../i18n/context';

/**
 * The machines that ran the join command and wait for Accept. Each shows the
 * four words the machine shows: accepting hands it this server's database
 * settings, so it is accepted only when they match.
 */
export function WaitingMachines({ joins, now }: { joins: MachineJoin[]; now: Date }) {
  const { t } = useTranslation();
  const accept = useAcceptMachineJoin();
  const remove = useRemoveMachineJoin();

  const act = async (join: MachineJoin, accepting: boolean) => {
    try {
      if (accepting) {
        await accept.mutateAsync(join.id);
        notifications.show({ color: 'green', message: t('servers.join.accepted', { name: join.name ?? '' }) });
      } else {
        await remove.mutateAsync(join.id);
        notifications.show({ message: t('servers.join.refused', { name: join.name ?? '' }) });
      }
    } catch (err) {
      notifications.show({
        color: 'red',
        title: t('servers.failed'),
        message: err instanceof Error ? err.message : String(err),
        autoClose: false,
      });
    }
  };

  return (
    <Stack gap="sm">
      {joins.map((join) => (
        <Paper key={join.id} p="md" radius="md" withBorder bg="var(--mantine-color-blue-light)">
          <Group justify="space-between" wrap="wrap" gap="md">
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Text size="sm">
                <Text span fw={700}>
                  {t('servers.join.wants')}
                </Text>{' '}
                <Code>{join.name}</Code> ·{' '}
                {t('servers.join.asked', { runs: roleLabel(join.role).toLowerCase() })} ·{' '}
                {t('servers.join.ago', { ago: durationLabel(waitingFor(join, now)) })}
              </Text>
              <Text size="sm">
                {t('servers.join.words')}{' '}
                <Text span ff="monospace" fw={700}>
                  {join.words}
                </Text>
              </Text>
            </Stack>
            <Group gap="sm" wrap="nowrap">
              <Button loading={accept.isPending && accept.variables === join.id} onClick={() => void act(join, true)}>
                {t('servers.join.accept')}
              </Button>
              <Button variant="default" loading={remove.isPending && remove.variables === join.id} onClick={() => void act(join, false)}>
                {t('servers.join.refuse')}
              </Button>
            </Group>
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}
