import { Badge, Button, Group, Menu, Modal, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { leavesNoWorker, MACHINE_ROLES, nextRole, roleChange, roleColor, roleLabel, type Machine } from '../../domain/machines';
import { useChangeMachineRole } from '../../hooks/useMachines';
import { useTranslation } from '../../i18n/context';

/**
 * What a machine runs, in the Servers page's Runs column, and the menu that
 * switches it. Picking a role asks once; the machine finishes its work and
 * starts again in that role, which the row shows until it has.
 */
export function MachineRole({ machine, machines, now }: { machine: Machine; machines: Machine[]; now: Date }) {
  const { t } = useTranslation();
  const change = useChangeMachineRole();
  const [asking, setAsking] = useState<string | null>(null);
  const state = roleChange(machine, now);
  const next = nextRole(machine);

  const badge = (
    <Badge variant="light" color={roleColor(machine.role)} rightSection={state === 'open' ? <ChevronDown size={12} aria-hidden /> : undefined}>
      {roleLabel(machine.role)}
    </Badge>
  );
  const pending = machine.requested_role && machine.requested_role !== machine.role && (
    <Group gap={4} wrap="nowrap">
      <RefreshCw size={12} aria-hidden />
      <Text size="xs" c="dimmed">
        {t('servers.role.pending', { role: roleLabel(machine.requested_role) })}
      </Text>
    </Group>
  );

  const confirm = async () => {
    if (asking === null) return;
    try {
      await change.mutateAsync({ id: machine.id, role: asking });
      notifications.show({
        color: 'green',
        message: asking === machine.role
          ? t('servers.role.keptDone', { name: machine.name })
          : t('servers.role.asked', { name: machine.name, role: roleLabel(asking) }),
      });
      setAsking(null);
    } catch (err) {
      notifications.show({
        color: 'red',
        title: t('servers.role.failed'),
        message: err instanceof Error ? err.message : String(err),
        autoClose: false,
      });
    }
  };

  if (state !== 'open') {
    return (
      <Stack gap={2}>
        <Tooltip label={state === 'fixed' ? t('servers.role.fixed') : t('servers.role.quiet')} withArrow multiline w={280}>
          <span>{badge}</span>
        </Tooltip>
        {pending}
      </Stack>
    );
  }

  return (
    <Stack gap={2}>
      <Menu position="bottom-start" withArrow>
        <Menu.Target>
          <UnstyledButton aria-label={t('servers.role.change', { name: machine.name })}>{badge}</UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{t('servers.role.menu')}</Menu.Label>
          {MACHINE_ROLES.map((role) => {
            const blocked = role !== next && leavesNoWorker(machines, machine.id, role, now);
            const item = (
              <Menu.Item
                key={role}
                disabled={role === next || blocked}
                leftSection={role === next ? <Check size={14} aria-hidden /> : <span style={{ width: 14 }} />}
                onClick={() => setAsking(role)}
              >
                {roleLabel(role)}
              </Menu.Item>
            );
            return blocked ? (
              <Tooltip key={role} label={t('servers.role.lastWorker')} withArrow multiline w={260} position="right">
                <div>{item}</div>
              </Tooltip>
            ) : (
              item
            );
          })}
        </Menu.Dropdown>
      </Menu>
      {pending}

      <Modal
        opened={asking !== null}
        onClose={() => setAsking(null)}
        title={asking === machine.role ? t('servers.role.keepTitle', { name: machine.name }) : t('servers.role.confirmTitle', { name: machine.name, role: roleLabel(asking ?? '') })}
      >
        <Stack>
          <Text size="sm">{asking === machine.role ? t('servers.role.keepBody') : t('servers.role.confirmBody')}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAsking(null)}>
              {t('servers.role.cancel')}
            </Button>
            <Button loading={change.isPending} onClick={() => void confirm()}>
              {asking === machine.role ? t('servers.role.keep') : t('servers.role.confirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
