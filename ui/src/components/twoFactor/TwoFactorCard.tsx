import { Alert, Badge, Button, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { useRegenerateRecoveryCodes, useSecondFactorStatus } from '../../hooks/useSecondFactor';
import { DetailLoadingState, ErrorState } from '../state';
import { RecoveryCodes } from './RecoveryCodes';

/**
 * The signed-in account's authenticator app: whether it has one, how many
 * recovery codes are left, and a way to replace them.
 */
export function TwoFactorCard() {
  const status = useSecondFactorStatus();
  const regenerate = useRegenerateRecoveryCodes();
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState('');

  return (
    <Paper p="xl" radius="lg" withBorder shadow="sm">
      <Group gap="xs" mb="md">
        <ShieldCheck size={18} color="var(--mantine-color-teal-6)" />
        <Title order={3} size="h5">Two-factor sign-in</Title>
      </Group>
      {status.isPending && <DetailLoadingState />}
      {status.isError && (
        <ErrorState error={status.error} action="load your two-factor sign-in" onRetry={() => void status.refetch()} />
      )}
      {status.data && (
        <Stack gap="sm">
          {status.data.enrolled ? (
            <Group gap="xs">
              <Badge color="teal" variant="light">On</Badge>
              <Text size="sm">{status.data.recovery_codes_left} recovery codes left</Text>
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Not set up. {status.data.required ? 'You will set up an authenticator app at your next sign-in.' : 'This server does not require it.'}
            </Text>
          )}
          {status.data.enrolled && status.data.recovery_codes_left <= 3 && regenerate.data === undefined && (
            <Text size="xs" c="orange">Running low: make new recovery codes before you run out.</Text>
          )}
          {regenerate.data !== undefined && <RecoveryCodes codes={regenerate.data} />}
          {status.data.enrolled && regenerate.data === undefined && !asking && (
            <Button variant="light" size="xs" onClick={() => setAsking(true)} style={{ alignSelf: 'flex-start' }}>
              New recovery codes
            </Button>
          )}
          {asking && regenerate.data === undefined && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                regenerate.mutate(code.trim());
              }}
            >
              <Stack gap="xs">
                <Text size="xs" c="dimmed">Your old recovery codes stop working. Confirm with a code from your app.</Text>
                {regenerate.isError && (
                  <Alert icon={<AlertCircle size={16} />} color="red" variant="light">
                    <Text size="sm">{regenerate.error instanceof Error ? regenerate.error.message : 'Could not make new codes'}</Text>
                  </Alert>
                )}
                <TextInput
                  label="Code from the app"
                  required
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.currentTarget.value)}
                />
                <Group gap="xs">
                  <Button type="submit" size="xs" loading={regenerate.isPending}>Make new codes</Button>
                  <Button variant="subtle" size="xs" onClick={() => setAsking(false)}>Cancel</Button>
                </Group>
              </Stack>
            </form>
          )}
        </Stack>
      )}
    </Paper>
  );
}
