import { ActionIcon, CopyButton, Group, PasswordInput, Tooltip, type PasswordInputProps } from '@mantine/core';
import { Check, Copy, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { generatePassword } from '../../domain/password';

export interface NewPasswordInputProps extends Omit<PasswordInputProps, 'visible' | 'onVisibilityChange' | 'rightSection' | 'value'> {
  value: string;
  /** Receives a freshly generated password; the caller puts it in the field (and any confirmation). */
  onGenerate: (password: string) => void;
  /** What the password is for, read out by screen readers on the buttons, e.g. "administrator password". */
  subject?: string;
}

/**
 * A field for setting a new password, with a button that fills it with a
 * strong random one and a button that copies it.
 *
 * Generating shows the password, since nobody can keep a password they never
 * saw; the eye button hides it again. The value lives only in the caller's
 * form state: nothing here logs it or keeps it anywhere else. See
 * generatePassword in domain/password.ts for how it is drawn.
 */
export function NewPasswordInput({ value, onGenerate, subject = 'password', ...props }: NewPasswordInputProps) {
  const [visible, setVisible] = useState(false);

  const generate = () => {
    onGenerate(generatePassword());
    setVisible(true);
  };

  return (
    <PasswordInput
      autoComplete="new-password"
      {...props}
      value={value}
      visible={visible}
      onVisibilityChange={setVisible}
      rightSectionWidth={92}
      rightSectionPointerEvents="all"
      rightSection={
        <Group gap={2} wrap="nowrap">
          <Tooltip label={visible ? 'Hide' : 'Show'}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={visible ? `Hide ${subject}` : `Show ${subject}`}
              aria-pressed={visible}
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Generate a strong password">
            <ActionIcon variant="subtle" color="blue" size="sm" aria-label={`Generate ${subject}`} onClick={generate}>
              <RefreshCw size={16} />
            </ActionIcon>
          </Tooltip>
          <CopyButton value={value} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied' : 'Copy'}>
                <ActionIcon
                  variant="subtle"
                  color={copied ? 'green' : 'gray'}
                  size="sm"
                  aria-label={`Copy ${subject}`}
                  disabled={value.length === 0}
                  onClick={copy}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
      }
    />
  );
}
