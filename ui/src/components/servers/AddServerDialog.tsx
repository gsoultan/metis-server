import { Button, Code, CopyButton, Group, Loader, Modal, SegmentedControl, Stack, Text } from '@mantine/core';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';

import { joinCommand, joinState, MACHINE_ROLES, type IssuedMachineJoin, type MachineRole } from '../../domain/machineJoins';
import { roleLabel } from '../../domain/machines';
import { useMachineJoins, useMakeMachineJoin } from '../../hooks/useMachines';
import { useTranslation } from '../../i18n/context';

/**
 * Add a server: pick what the new machine runs, and get the one command to
 * run there. The machine then shows up on the Servers page to be accepted.
 */
export function AddServerDialog({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [role, setRole] = useState<MachineRole>('worker');
  const [issued, setIssued] = useState<IssuedMachineJoin | null>(null);
  const make = useMakeMachineJoin();
  const { data } = useMachineJoins();
  const join = issued ? data?.joins.find((j) => j.id === issued.id) : undefined;
  const ran = join !== undefined && joinState(join) !== 'code';

  const close = () => {
    setIssued(null);
    make.reset();
    onClose();
  };

  const command = issued ? joinCommand(window.location.origin, issued.code) : '';

  return (
    <Modal opened={opened} onClose={close} title={t('servers.add.title')} centered size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          {t('servers.add.body')}
        </Text>
        <Stack gap={6}>
          <Text size="sm" fw={500} id="add-server-role">
            {t('servers.add.runs')}
          </Text>
          <SegmentedControl
            aria-labelledby="add-server-role"
            value={role}
            onChange={(value) => setRole(value as MachineRole)}
            disabled={issued !== null}
            data={MACHINE_ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
          />
        </Stack>

        {issued === null ? (
          <>
            {make.error && (
              <Text size="sm" c="red">
                {make.error.message}
              </Text>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {t('servers.add.cancel')}
              </Button>
              <Button loading={make.isPending} onClick={() => make.mutate(role, { onSuccess: setIssued })}>
                {t('servers.add.make')}
              </Button>
            </Group>
          </>
        ) : (
          <>
            <Stack gap={6}>
              <Text size="sm" fw={500}>
                {t('servers.add.command')}
              </Text>
              <Code block fz="sm">
                {command}
              </Code>
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Text size="xs" c="dimmed">
                  {t('servers.add.hint')}
                </Text>
                <CopyButton value={command}>
                  {({ copied, copy }) => (
                    <Button variant="subtle" size="compact-sm" onClick={copy}>
                      {copied ? t('servers.add.copied') : t('servers.add.copy')}
                    </Button>
                  )}
                </CopyButton>
              </Group>
            </Stack>
            <Group gap="xs" wrap="nowrap" role="status">
              {ran ? <CircleCheck size={16} color="var(--mantine-color-green-6)" /> : <Loader size={14} />}
              <Text size="sm">
                {ran ? t('servers.add.ran', { name: join?.name ?? '' }) : t('servers.add.waiting')}
              </Text>
            </Group>
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {t('servers.add.close')}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
