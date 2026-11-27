import { ActionIcon, Alert, Code, CopyButton, Group, Stack, Text, Tooltip } from '@mantine/core';
import { Check, Copy, ShieldAlert } from 'lucide-react';

import type { PlatformAdminRefusal } from '../../domain/platformAdmin';
import { useTranslation } from '../../i18n/context';

/**
 * In place of a page every organization on the installation shares, for an
 * administrator of one organization: who can see it, and the one line whoever
 * runs the server adds so this account can.
 */
export function PlatformAdminOnly({ refusal }: { refusal: PlatformAdminRefusal }) {
  const { t } = useTranslation();
  const line = `METIS_PLATFORM_ADMINS=${refusal.accountId || '<your account id>'}`;
  return (
    <Alert color="yellow" icon={<ShieldAlert size={18} />} title={t('platformAdmin.title')}>
      <Stack gap="xs">
        <Text size="sm">{t('platformAdmin.body')}</Text>
        <Text size="sm">{t('platformAdmin.how')}</Text>
        <Group gap={4} wrap="nowrap">
          <Code block style={{ flex: 1, wordBreak: 'break-all' }}>
            {line}
          </Code>
          <CopyButton value={line}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? t('platformAdmin.copied') : t('platformAdmin.copy')}>
                <ActionIcon aria-label={t('platformAdmin.copy')} variant="light" onClick={copy}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
        <Text size="xs" c="dimmed">
          {t('platformAdmin.more')}
        </Text>
      </Stack>
    </Alert>
  );
}
