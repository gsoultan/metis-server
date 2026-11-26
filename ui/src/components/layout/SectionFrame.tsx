import { Card, Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

import { PageHeader } from './PageShell';

interface SectionFrameProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  /**
   * The section is the whole page (one sidebar entry, one page): its title is
   * the page's, and what it lists sits on one card under it. Otherwise it is a
   * card among others on a page.
   */
  asPage?: boolean;
  children: ReactNode;
}

/** A titled section that is either a page of its own or a card on one. */
export function SectionFrame({ title, description, icon, action, asPage = false, children }: SectionFrameProps) {
  if (asPage) {
    return (
      <Stack gap="lg">
        <PageHeader title={title} description={description} actions={action} />
        <Card withBorder radius="lg" p="lg">
          {children}
        </Card>
      </Stack>
    );
  }
  return (
    <Card withBorder radius="lg" p="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Group gap="xs">
              {icon}
              <Title order={4}>{title}</Title>
            </Group>
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          </div>
          {action}
        </Group>
        {children}
      </Stack>
    </Card>
  );
}
