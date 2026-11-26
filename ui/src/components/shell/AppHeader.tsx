import { ActionIcon, Box, Burger, Divider, Group, Menu, Select, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { FolderGit2, HelpCircle, Moon, Network, Sun } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { NotificationCenter } from '../NotificationCenter';
import { GlobalSearch } from './GlobalSearch';
import { OrganizationPicker } from './OrganizationPicker';
import classes from './AppHeader.module.css';
import { LanguageMenu } from '../../i18n/LanguageMenu';

interface AppHeaderProps {
  navOpened: boolean;
  onNavToggle: () => void;
  onHelpOpen: () => void;
  organizations: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
  /** The sidebar's width, which the brand takes so the search lines up with the page. */
  brandWidth: number;
}

/**
 * The top bar, across the whole window: the brand over the sidebar, the search
 * after it, and on the right where you are working (organization, project) and
 * the controls (notifications, theme, language, help).
 *
 * It shares the sidebar's frame colour and has no bottom line; the page panel
 * below it is what stands apart.
 */
export function AppHeader({ navOpened, onNavToggle, onHelpOpen, organizations, projects, brandWidth }: AppHeaderProps) {
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const setCurrentProjectId = useAppStore((state) => state.setCurrentProjectId);

  const isDark = theme === 'dark';
  const currentProject = projects.find((p) => p.id === currentProjectId);

  const contextSelectors = (
    <>
      <OrganizationPicker organizations={organizations} />
      <Select
        aria-label="Project"
        placeholder="Select a project"
        leftSection={<FolderGit2 size={15} />}
        data={projects.map((p) => ({ value: p.id, label: p.name }))}
        value={currentProjectId}
        onChange={setCurrentProjectId}
        size="sm"
        w={190}
        comboboxProps={{ withinPortal: true }}
        allowDeselect={false}
        nothingFoundMessage="No projects in this organization"
      />
    </>
  );

  return (
    <div className={classes.header}>
      <Group h="100%" pr="md" justify="space-between" wrap="nowrap" gap="sm">
        <Group gap={0} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <Box className={classes.brandSlot} style={{ width: brandWidth }} visibleFrom="sm">
            <Link to="/" className={classes.brand} aria-label="Metis home">
              <span className={classes.brandMark} aria-hidden>
                <Network size={16} strokeWidth={2} />
              </span>
              {brandWidth > 100 && <span className={classes.brandName}>Metis</span>}
            </Link>
          </Box>
          <Burger opened={navOpened} onClick={onNavToggle} hiddenFrom="sm" size="sm" ml="md" mr="sm" aria-label="Toggle navigation" />
          <Box visibleFrom="xs" ml={{ base: 0, sm: 'md' }} style={{ minWidth: 0 }}>
            <GlobalSearch />
          </Box>
        </Group>

        <Group gap="xs" wrap="nowrap">
          {/* Organization and project: full controls on a wide screen… */}
          <Group gap="xs" wrap="nowrap" visibleFrom="md">
            {contextSelectors}
          </Group>

          {/* …and the current project, tappable, on a narrow one. */}
          <Box hiddenFrom="md" style={{ minWidth: 0 }}>
            <Menu position="bottom-end" width={260} withinPortal>
              <Menu.Target>
                <UnstyledButton className={classes.contextButton}>
                  <FolderGit2 size={15} />
                  <Text size="sm" fw={500} truncate>
                    {currentProject?.name ?? 'Select a project'}
                  </Text>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Switch context</Menu.Label>
                <Box p="xs">
                  <Group gap="xs" wrap="wrap">
                    {contextSelectors}
                  </Group>
                </Box>
              </Menu.Dropdown>
            </Menu>
          </Box>

          <Divider orientation="vertical" my={18} mx={4} visibleFrom="sm" />

          <Group gap={2} wrap="nowrap">
            <NotificationCenter />

            <Tooltip label={isDark ? 'Switch to light theme' : 'Switch to dark theme'} withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                onClick={toggleTheme}
                aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </ActionIcon>
            </Tooltip>

            <LanguageMenu />

            <Tooltip label="Help" withArrow>
              <ActionIcon variant="subtle" color="gray" size="lg" onClick={onHelpOpen} aria-label="Open help">
                <HelpCircle size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Group>
    </div>
  );
}
