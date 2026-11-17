import { Alert, Button, Code, Stack, Text, TextInput } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, Smartphone } from 'lucide-react';
import { useState } from 'react';

import { secondFactorService } from '../../services/domains/secondFactorService';
import type { LoginResponse, SecondFactorStep as Step } from '../../services/types';
import { QrCode } from './QrCode';
import { RecoveryCodes } from './RecoveryCodes';

interface Props {
  step: Step;
  challenge: string;
  /** A session: the step is done. */
  onSignedIn: (reply: LoginResponse) => void | Promise<void>;
  /** Back to the password, for a challenge that ran out. */
  onStartOver: () => void;
}

/**
 * The step after a correct password, for a staff account that signs in with
 * an authenticator app: the app's code, or setting the app up on the first
 * sign-in.
 */
export function SecondFactorStep({ step, challenge, onSignedIn, onStartOver }: Props) {
  if (step === 'enrol') {
    return <Enrol challenge={challenge} onSignedIn={onSignedIn} onStartOver={onStartOver} />;
  }
  return <EnterCode challenge={challenge} onSignedIn={onSignedIn} onStartOver={onStartOver} />;
}

type StepProps = Omit<Props, 'step'>;

function failure(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Something went wrong; try again.';
}

function CodeInput({ value, onChange, label, description }: { value: string; onChange: (v: string) => void; label: string; description: string }) {
  return (
    <TextInput
      label={label}
      description={description}
      placeholder="123456"
      required
      size="md"
      radius="md"
      autoFocus
      autoComplete="one-time-code"
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      styles={{ input: { letterSpacing: '0.2em', fontFamily: 'var(--mantine-font-family-monospace)' } }}
    />
  );
}

function EnterCode({ challenge, onSignedIn, onStartOver }: StepProps) {
  const [code, setCode] = useState('');
  const submit = useMutation({
    mutationFn: () => secondFactorService.signInWithCode(challenge, code.trim()),
    onSuccess: (reply) => onSignedIn(reply),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Open your authenticator app and enter the six-digit code it shows for Metis. Lost your phone? Enter one of
          your recovery codes instead.
        </Text>
        {submit.isError && (
          <Alert icon={<AlertCircle size={18} />} color="red" variant="light" radius="md">
            <Text size="sm">{failure(submit.error)}</Text>
          </Alert>
        )}
        <CodeInput value={code} onChange={setCode} label="Code" description="From the app, or a recovery code" />
        <Button type="submit" fullWidth size="lg" radius="md" loading={submit.isPending} rightSection={<ArrowRight size={18} />}>
          Verify
        </Button>
        <Button variant="subtle" size="xs" onClick={onStartOver}>
          Start over
        </Button>
      </Stack>
    </form>
  );
}

function Enrol({ challenge, onSignedIn, onStartOver }: StepProps) {
  const [code, setCode] = useState('');
  const begin = useMutation({ mutationFn: () => secondFactorService.beginEnrolment(challenge) });
  const confirm = useMutation({ mutationFn: () => secondFactorService.confirmEnrolment(challenge, code.trim()) });

  // Done: the session is held back until the codes have been seen.
  if (confirm.data) {
    const reply = confirm.data;
    return (
      <Stack gap="md">
        <RecoveryCodes codes={reply.recovery_codes ?? []} />
        <Button fullWidth size="lg" radius="md" onClick={() => void onSignedIn(reply)} rightSection={<ArrowRight size={18} />}>
          I have saved them
        </Button>
      </Stack>
    );
  }

  if (!begin.data) {
    return (
      <Stack gap="md">
        <Alert icon={<Smartphone size={18} />} color="blue" variant="light" radius="md">
          <Text size="sm" fw={600}>Set up two-factor sign-in</Text>
          <Text size="xs" c="dimmed" mt={4}>
            Your account needs an authenticator app, such as Google Authenticator, Microsoft Authenticator,
            1Password or Authy. You will be asked for a code from it each time you sign in.
          </Text>
        </Alert>
        {begin.isError && (
          <Alert icon={<AlertCircle size={18} />} color="red" variant="light" radius="md">
            <Text size="sm">{failure(begin.error)}</Text>
          </Alert>
        )}
        <Button fullWidth size="lg" radius="md" loading={begin.isPending} onClick={() => begin.mutate()}>
          Set up the app
        </Button>
        <Button variant="subtle" size="xs" onClick={onStartOver}>
          Start over
        </Button>
      </Stack>
    );
  }

  const { secret, otpauth_uri: uri } = begin.data;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        confirm.mutate();
      }}
    >
      <Stack gap="md" align="stretch">
        <Text size="sm">Scan this code with your authenticator app.</Text>
        <Stack align="center" gap={6}>
          <QrCode value={uri} label="QR code to add Metis to your authenticator app" />
          <Text size="xs" c="dimmed">Can&apos;t scan it? Enter this key in the app:</Text>
          <Code data-testid="two-factor-secret" style={{ wordBreak: 'break-all' }}>{secret}</Code>
        </Stack>
        {confirm.isError && (
          <Alert icon={<AlertCircle size={18} />} color="red" variant="light" radius="md">
            <Text size="sm">{failure(confirm.error)}</Text>
          </Alert>
        )}
        <CodeInput value={code} onChange={setCode} label="Code from the app" description="The six digits the app now shows for Metis" />
        <Button type="submit" fullWidth size="lg" radius="md" loading={confirm.isPending}>
          Turn on two-factor sign-in
        </Button>
        <Button variant="subtle" size="xs" onClick={onStartOver}>
          Start over
        </Button>
      </Stack>
    </form>
  );
}
