/**
 * The signed-in person, at the foot of the sidebar: their name, and a menu for
 * their profile, settings, expert mode and signing out.
 *
 * It lived at the right of the top bar. The top bar now carries the search and
 * the organization and project, and who you are belongs with the navigation
 * you are using, where a collapsed rail still shows the avatar.
 */
import { Avatar, Box, Menu, Switch, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { Link, useNavigate } from '@tanstack/react-router';
import { LogOut, MoreVertical, Settings, User } from 'lucide-react';

import { processService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import classes from './Sidebar.module.css';

export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const user = useAppStore((state) => state.user);
  const clearAuth = useAppStore((state) => state.clearAuth);
  const expertMode = useAppStore((state) => state.expertMode);
  const setExpertMode = useAppStore((state) => state.setExpertMode);
  const navigate = useNavigate();

  const signOut = () => {
    void processService.signOut().catch(() => undefined);
    clearAuth();
    void navigate({ to: '/login' });
  };

  const name = user?.displayName || user?.name || user?.username || '';
  const initial = (name || 'U').charAt(0).toUpperCase();

  const target = (
    <UnstyledButton className={classes.account} aria-label="Account menu">
      <Avatar color="indigo" radius="xl" size={30}>
        {initial}
      </Avatar>
      {!collapsed && (
        <>
          <Box className={classes.accountText}>
            <Text size="sm" fw={500} truncate>
              {name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {user?.username}
            </Text>
          </Box>
          <MoreVertical size={16} className={classes.accountMore} aria-hidden />
        </>
      )}
    </UnstyledButton>
  );

  return (
    <Menu shadow="md" width={240} position={collapsed ? 'right-end' : 'top-start'} withinPortal>
      <Menu.Target>{collapsed ? <Tooltip label={name} position="right" withArrow>{target}</Tooltip> : target}</Menu.Target>

      <Menu.Dropdown>
        <Menu.Item component={Link} to="/profile" leftSection={<User size={14} />}>
          Profile
        </Menu.Item>
        <Menu.Item component={Link} to="/settings" leftSection={<Settings size={14} />}>
          Settings
        </Menu.Item>

        <Menu.Divider />

        <Menu.Item
          closeMenuOnClick={false}
          onClick={() => setExpertMode(!expertMode)}
          rightSection={
            <Switch
              checked={expertMode}
              onChange={(event) => setExpertMode(event.currentTarget.checked)}
              size="xs"
              aria-label="Expert mode"
              tabIndex={-1}
            />
          }
        >
          <Text size="sm">Expert mode</Text>
          <Text size="xs" c="dimmed">
            Show advanced technical settings
          </Text>
        </Menu.Item>

        <Menu.Divider />

        <Menu.Item color="red" leftSection={<LogOut size={14} />} onClick={signOut}>
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
