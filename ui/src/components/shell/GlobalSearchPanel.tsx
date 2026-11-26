/**
 * The body of the search dialog: the query box and its results. A module of
 * its own so the lists it reads, and the code that ranks them, load only when
 * someone opens the search, not with every page.
 */
import { ScrollArea, Text, TextInput, UnstyledButton } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { CornerDownLeft, LayoutGrid, Network, Search, Table2, type LucideIcon } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';

import { matchesQuery } from '../../domain/textSearch';
import { useDecisionSummaries } from '../../hooks/useDecisions';
import { useDefinitions } from '../../hooks/useDefinitions';
import { useTranslation } from '../../i18n/context';
import classes from './GlobalSearch.module.css';

/** The largest page the server serves. */
const PROCESS_PAGE = 200;
/** Results shown per kind, so one long list does not push the others away. */
const PER_GROUP = 6;

interface Hit {
  id: string;
  kind: 'process' | 'decision' | 'page';
  title: string;
  detail: string;
  open: () => void;
}

interface Group {
  label: string;
  icon: LucideIcon;
  hits: Hit[];
}

/** The pages a person most often looks for by name. */
const PAGES: Array<{ label: string; to: string; search?: Record<string, string> }> = [
  { label: 'nav.dashboard', to: '/' },
  { label: 'nav.inbox', to: '/inbox' },
  { label: 'nav.allTasks', to: '/tasks' },
  { label: 'nav.people', to: '/people' },
  { label: 'nav.processes', to: '/models' },
  { label: 'nav.decisions', to: '/decisions' },
  { label: 'nav.catalogue', to: '/connectors', search: { section: 'catalogue' } },
  { label: 'nav.myConnections', to: '/connectors', search: { section: 'connections' } },
  { label: 'nav.outgoingWebhooks', to: '/connectors', search: { section: 'outgoing' } },
  { label: 'nav.incomingWebhooks', to: '/connectors', search: { section: 'incoming' } },
  { label: 'nav.instances', to: '/instances' },
  { label: 'nav.archive', to: '/archive' },
  { label: 'nav.releases', to: '/releases' },
  { label: 'nav.projects', to: '/projects' },
  { label: 'nav.organizations', to: '/organizations' },
  { label: 'nav.groups', to: '/groups' },
  { label: 'nav.settings', to: '/settings' },
];

export default function SearchPanel({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const definitions = useDefinitions(1, PROCESS_PAGE);
  const decisions = useDecisionSummaries();

  const groups = useMemo<Group[]>(() => {
    const q = query.trim();
    const go = (to: string, search?: Record<string, string>) => () => {
      onDone();
      void navigate({ to, search });
    };

    const processes = (definitions.data?.definitions ?? [])
      .filter((d) => q === '' || matchesQuery(q, d.name, d.key))
      .slice(0, PER_GROUP)
      .map<Hit>((d) => ({
        id: `p-${d.id}`,
        kind: 'process',
        title: d.name || d.key,
        detail: `${d.key} · process · v${d.version}`,
        open: go('/designer', { definitionId: d.id }),
      }));

    const decisionHits = (decisions.data?.items ?? [])
      .filter((d) => q === '' || matchesQuery(q, d.name, d.key))
      .slice(0, PER_GROUP)
      .map<Hit>((d) => ({
        id: `d-${d.id}`,
        kind: 'decision',
        title: d.name || d.key,
        detail: `${d.key} · decision · ${d.live_version ? `v${d.live_version} live` : 'not live'}`,
        open: go('/decision-editor', { id: d.id }),
      }));

    const pages = PAGES.map((page) => ({ ...page, title: t(page.label) }))
      .filter((page) => q !== '' && matchesQuery(q, page.title))
      .slice(0, PER_GROUP)
      .map<Hit>((page) => ({
        id: `g-${page.label}`,
        kind: 'page',
        title: page.title,
        detail: 'Page',
        open: go(page.to, page.search),
      }));

    return [
      { label: 'Processes', icon: Network, hits: processes },
      { label: 'Decisions', icon: Table2, hits: decisionHits },
      { label: 'Pages', icon: LayoutGrid, hits: pages },
    ].filter((group) => group.hits.length > 0);
  }, [query, definitions.data, decisions.data, navigate, onDone, t]);

  const flat = groups.flatMap((group) => group.hits);
  const selected = Math.min(cursor, Math.max(flat.length - 1, 0));
  const loading = definitions.isLoading || decisions.isLoading;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((selected + 1) % Math.max(flat.length, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((selected - 1 + flat.length) % Math.max(flat.length, 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      flat[selected]?.open();
    }
  };

  let index = -1;
  return (
    <div>
      <TextInput
        data-autofocus
        variant="unstyled"
        size="md"
        className={classes.input}
        leftSection={<Search size={17} aria-hidden />}
        placeholder="Search processes, decisions, pages"
        aria-label="Search"
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setCursor(0);
        }}
        onKeyDown={onKeyDown}
      />
      <ScrollArea.Autosize mah="60vh" type="auto">
        <div className={classes.results} role="listbox" aria-label="Results">
          {groups.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              {loading ? 'Loading…' : query.trim() === '' ? 'Nothing in this project yet.' : `Nothing matches “${query.trim()}”.`}
            </Text>
          ) : (
            groups.map((group) => (
              <div key={group.label} className={classes.group}>
                <div className={classes.groupLabel}>{group.label}</div>
                {group.hits.map((hit) => {
                  index += 1;
                  const active = index === selected;
                  const position = index;
                  return (
                    <UnstyledButton
                      key={hit.id}
                      role="option"
                      aria-selected={active}
                      className={classes.hit}
                      data-active={active || undefined}
                      onMouseEnter={() => setCursor(position)}
                      onClick={hit.open}
                    >
                      <span className={classes.hitIcon} aria-hidden>
                        <group.icon size={15} />
                      </span>
                      <span className={classes.hitText}>
                        <span className={classes.hitTitle}>{hit.title}</span>
                        <span className={classes.hitDetail}>{hit.detail}</span>
                      </span>
                      {active && <CornerDownLeft size={14} className={classes.enter} aria-hidden />}
                    </UnstyledButton>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </ScrollArea.Autosize>
      <div className={classes.footer}>
        <span>↑↓ to move</span>
        <span>↵ to open</span>
        <span>Esc to close</span>
      </div>
    </div>
  );
}
