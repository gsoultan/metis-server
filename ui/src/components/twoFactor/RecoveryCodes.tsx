import { Alert, Button, CopyButton, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { KeyRound } from 'lucide-react';

/**
 * Recovery codes, shown the one time the server gives them out. Each signs in
 * once in place of the app's code, for the day the phone is lost.
 */
export function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <Stack gap="sm">
      <Alert icon={<KeyRound size={18} />} color="yellow" variant="light" radius="md">
        <Text size="sm" fw={600}>Save these recovery codes somewhere safe.</Text>
        <Text size="xs" c="dimmed" mt={4}>
          Each one signs you in once if you lose your phone. They will not be shown again.
        </Text>
      </Alert>
      <SimpleGrid cols={2} spacing="xs" data-testid="recovery-codes">
        {codes.map((code) => (
          <Text key={code} ff="monospace" size="sm" ta="center" p={6} bg="var(--mantine-color-gray-light)" style={{ borderRadius: 6 }}>
            {code}
          </Text>
        ))}
      </SimpleGrid>
      <Group justify="flex-end">
        <CopyButton value={codes.join('\n')}>
          {({ copied, copy }) => (
            <Button variant="light" size="xs" onClick={copy}>
              {copied ? 'Copied' : 'Copy codes'}
            </Button>
          )}
        </CopyButton>
      </Group>
    </Stack>
  );
}
