import { Alert, Badge, Button, Card, Checkbox, Group, List, Modal, Stack, Text, Title } from '@mantine/core';
import { CircleAlert, CircleCheck, Network, Table2, Users } from 'lucide-react';
import { useState } from 'react';

import { nodeLabel } from '../domain/bpmnVocabulary';
import { EXAMPLE_GROUPS, EXAMPLES, type Example } from '../domain/examples';
import type { AddedItem } from '../domain/examples/install';
import { useAddExamples } from '../hooks/useAddExamples';
import { errorMessage } from '../services/shared/errors';
import { useAppStore } from '../store/useAppStore';
import { AnchorLink } from './RouterLinks';

interface ExamplesModalProps {
  opened: boolean;
  onClose: () => void;
}

/** The step kinds an example uses, by their plain names, once each. */
function stepNames(example: Example, expertMode: boolean): string[] {
  const kinds = new Set(
    example.process.nodes.map((node) => node.type ?? '').filter((kind) => kind !== 'startEvent' && kind !== 'endEvent'),
  );
  return [...kinds].map((kind) => nodeLabel(kind, expertMode));
}

/**
 * Worked examples, added to the project in one click: two processes, the
 * decision tables they ask, and the groups their approval steps are offered
 * to. Each card says how its table steers the process, because "how does
 * the decision relate to the process?" is the first thing people ask.
 */
export function ExamplesModal({ opened, onClose }: ExamplesModalProps) {
  const expertMode = useAppStore((state) => state.expertMode);
  const username = useAppStore((state) => state.user?.username);
  const [joinGroups, setJoinGroups] = useState(true);
  const add = useAddExamples();

  const close = () => {
    add.reset();
    onClose();
  };

  return (
    <Modal opened={opened} onClose={close} title="Learn from examples" size="xl">
      <Stack gap="md">
        {add.data && (
          <AddedSummary items={add.data.items} problems={add.data.problems} username={username} onOpen={close} />
        )}

        {!add.isSuccess && (
          <Text size="sm">
            Adds two working processes and the decision tables they use to this project. Open them, run them and change
            them. An example that is already here is left as it is.
          </Text>
        )}

        {!add.isSuccess &&
          EXAMPLES.map((example) => (
            <Card key={example.id} withBorder radius="md" p="md">
              <Stack gap="xs">
                <Group gap="xs">
                  <Network size={18} aria-hidden />
                  <Title order={4}>{example.title}</Title>
                </Group>
                <Text size="sm">{example.summary}</Text>
                <Group gap={6} aria-label="Steps it uses">
                  {stepNames(example, expertMode).map((name) => (
                    <Badge key={name} variant="light" color="indigo" size="sm">
                      {name}
                    </Badge>
                  ))}
                </Group>
                <Text size="sm" fw={600} mt={4}>
                  How the decision table steers it
                </Text>
                <List size="sm" spacing={2} withPadding style={{ listStyleType: 'disc' }}>
                  {example.howTheDecisionDrives.map((line) => (
                    <List.Item key={line}>{line}</List.Item>
                  ))}
                </List>
                <Text size="sm" fw={600} mt={4}>
                  Try it
                </Text>
                <List size="sm" spacing={2} withPadding type="ordered" style={{ listStyleType: 'decimal' }}>
                  {example.tryIt.map((line) => (
                    <List.Item key={line}>{line}</List.Item>
                  ))}
                </List>
              </Stack>
            </Card>
          ))}

        {!add.isSuccess && (
          <Checkbox
            checked={joinGroups}
            onChange={(event) => setJoinGroups(event.currentTarget.checked)}
            disabled={add.isPending}
            label={`Also add the groups ${EXAMPLE_GROUPS.map((g) => g.name).join(' and ')}, with me in both`}
            description="They are added to this project's People too, so you can act as every approver yourself. Leave it off to set the groups up yourself under People."
          />
        )}

        {add.isError && (
          <Alert color="red" icon={<CircleAlert size={16} />} title="The examples could not be added">
            {errorMessage(add.error)} Nothing already added was changed; try again once the cause is fixed.
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            {add.isSuccess ? 'Done' : 'Cancel'}
          </Button>
          {!add.isSuccess && (
            <Button color="indigo" loading={add.isPending} onClick={() => add.mutate({ joinGroups })}>
              Add the examples
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}

const OUTCOME_WORDS: Record<AddedItem['outcome'], string> = {
  added: 'added',
  'already-there': 'already here, left as it is',
  joined: 'you were added to it',
};

function AddedSummary({
  items,
  problems,
  username,
  onOpen,
}: {
  items: AddedItem[];
  problems: string[];
  username: string | undefined;
  onOpen: () => void;
}) {
  return (
    <Stack gap="xs">
      <Alert color="teal" icon={<CircleCheck size={16} />} title="The examples are ready">
        <Stack gap={4}>
          {items.map((item) => (
            <Group key={`${item.kind}-${item.key}-${item.outcome}`} gap={6} wrap="nowrap">
              {item.kind === 'process' && <Network size={14} aria-hidden />}
              {item.kind === 'decision' && <Table2 size={14} aria-hidden />}
              {item.kind === 'group' && <Users size={14} aria-hidden />}
              {item.kind === 'process' && (
                <AnchorLink size="sm" to="/designer" search={{ definitionId: item.id }} onClick={onOpen}>
                  {item.name}
                </AnchorLink>
              )}
              {item.kind === 'decision' && (
                <AnchorLink size="sm" to="/decision-editor" search={{ id: item.id }} onClick={onOpen}>
                  {item.name}
                </AnchorLink>
              )}
              {item.kind === 'group' && <Text size="sm">Group {item.name}</Text>}
              <Text size="sm" c="dimmed">
                {OUTCOME_WORDS[item.outcome]}
              </Text>
            </Group>
          ))}
          {username !== undefined && (
            <Text size="sm" mt={4}>
              When you start one, type <b>{username}</b> as your username, so a revision comes back to you.
            </Text>
          )}
        </Stack>
      </Alert>
      {problems.map((problem) => (
        <Alert key={problem} color="yellow" icon={<CircleAlert size={16} />}>
          {problem}
        </Alert>
      ))}
    </Stack>
  );
}
