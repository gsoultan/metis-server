/**
 * The connections configured in this project.
 *
 * It says what is configured and when, and no more. It used to show a
 * hard-coded "Online" badge and a "99.8% (1.2k calls)" success rate on every
 * row; nothing measures either, and a health figure nobody measured is worse
 * than none.
 */
import {
  ActionIcon,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Play, Settings, Trash2 } from 'lucide-react';

import type { ApiConnector, ApiConnectorInstance } from '../../services/types';
import { ConnectorGlyph } from './ConnectorGlyph';

dayjs.extend(relativeTime);

interface ConnectorInstanceTableProps {
  instances: ApiConnectorInstance[];
  connectors: ApiConnector[];
  expertMode: boolean;
  onTest: (instance: ApiConnectorInstance, connector: ApiConnector | undefined) => void;
  onEdit: (instance: ApiConnectorInstance) => void;
  onDelete: (instance: ApiConnectorInstance) => void;
}

export function ConnectorInstanceTable({
  instances,
  connectors,
  expertMode,
  onTest,
  onEdit,
  onDelete,
}: ConnectorInstanceTableProps) {
  return (
    <Paper radius="lg" withBorder>
      {instances.length === 0 ? (
        <Stack align="center" gap={6} py={48} px="lg">
          <Text fw={600}>No connections yet</Text>
          <Text size="sm" c="dimmed" ta="center">
            Pick a connector from the catalogue to add one. Each connection gets a name a step can choose.
          </Text>
        </Stack>
      ) : (
        <ScrollArea>
          <Table verticalSpacing="md" horizontalSpacing="lg">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Connection</Table.Th>
                <Table.Th>Service</Table.Th>
                <Table.Th>Added</Table.Th>
                <Table.Th ta="right">Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {instances.map((instance) => {
                const connector = connectors.find((c) => c.id === instance.connector?.id);
                return (
                  <Table.Tr key={instance.id}>
                    <Table.Td>
                      <Group gap="sm">
                        <ThemeIcon size="md" variant="light" color="gray">
                          <ConnectorGlyph name={connector?.icon} size={18} />
                        </ThemeIcon>
                        <Stack gap={0}>
                          <Text fw={700} size="sm">{instance.name}</Text>
                          {expertMode && <Text size="xs" c="dimmed" ff="monospace">{instance.id}</Text>}
                        </Stack>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{connector?.name || 'Unknown'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {instance.created_at ? dayjs(instance.created_at).fromNow() : '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" justify="flex-end">
                        <Tooltip label="Test connection">
                          <ActionIcon
                            aria-label={`Test the ${instance.name} connection`}
                            variant="subtle"
                            color="gray"
                            onClick={() => onTest(instance, connector)}
                          >
                            <Play size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Configure">
                          <ActionIcon
                            aria-label={`Configure ${instance.name}`}
                            variant="subtle"
                            color="gray"
                            onClick={() => onEdit(instance)}
                          >
                            <Settings size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Remove">
                          <ActionIcon
                            aria-label={`Remove the ${instance.name} connection`}
                            variant="subtle"
                            color="red"
                            onClick={() => onDelete(instance)}
                          >
                            <Trash2 size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Paper>
  );
}
