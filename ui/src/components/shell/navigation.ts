/**
 * The menu: its sections, the pages in each, and which page is being looked
 * at. The sidebar draws it; the page header reads where a page sits in it.
 */
import {
  Archive,
  PackageCheck,
  Contact,
  Cog,
  ClipboardList,
  LayoutGrid,
  Network,
  Play,
  ShieldCheck,
  Table2,
  TerminalSquare,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { useTranslation } from '../../i18n/context';

/** Where the router is, as a nav item's activeOn reads it. */
export interface NavLocation {
  pathname: string;
  search: Record<string, unknown>;
}

export interface NavLeaf {
  label: string;
  to: string;
  /** Search params the link carries, for a page chosen by one (Connectors). */
  search?: Record<string, string>;
  hint?: string;
  activeOn?: (location: NavLocation) => boolean;
  adminOnly?: boolean;
}

export interface NavItem extends NavLeaf {
  icon: LucideIcon;
  /**
   * The pages under this one. A group opens when one of its pages is the one
   * being looked at, so the menu stays short and still shows where you are.
   */
  children?: NavLeaf[];
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const connectorPage = (section: string) => ({ pathname, search }: NavLocation) =>
  pathname === '/connectors' && (search.section ?? 'catalogue') === section;

export const sections: NavSection[] = [
  {
    label: 'nav.sectionWork',
    items: [
      { icon: LayoutGrid, label: 'nav.dashboard', to: '/', hint: 'Overview of this project' },
      { icon: ClipboardList, label: 'nav.inbox', to: '/inbox', hint: 'Tasks assigned to you' },
      { icon: Users, label: 'nav.allTasks', to: '/tasks', hint: 'Every task in this project' },
      // The people processes assign work to, apart from the accounts that run
      // the platform, which sit under Administration.
      { icon: Contact, label: 'nav.people', to: '/people', hint: 'Who this project can assign work to' },
    ],
  },
  {
    label: 'nav.sectionBuild',
    items: [
      {
        icon: Network,
        label: 'nav.processes',
        to: '/models',
        hint: 'Design and deploy process models',
        activeOn: ({ pathname, search }) =>
          pathname === '/designer' || (pathname === '/models' && search.tab !== 'decisions'),
      },
      {
        icon: Table2,
        label: 'nav.decisions',
        to: '/decisions',
        hint: 'Business rules as decision tables',
        activeOn: ({ pathname, search }) =>
          pathname === '/decision-editor' || pathname === '/decisions' || (pathname === '/models' && search.tab === 'decisions'),
      },
      {
        icon: Zap,
        label: 'nav.connectors',
        to: '/connectors',
        hint: 'Connect to other systems',
        children: [
          { label: 'nav.catalogue', to: '/connectors', search: { section: 'catalogue' }, activeOn: connectorPage('catalogue') },
          { label: 'nav.myConnections', to: '/connectors', search: { section: 'connections' }, activeOn: connectorPage('connections') },
          { label: 'nav.connectorDocuments', to: '/connectors', search: { section: 'documents' }, activeOn: connectorPage('documents') },
          { label: 'nav.outgoingWebhooks', to: '/connectors', search: { section: 'outgoing' }, activeOn: connectorPage('outgoing') },
          { label: 'nav.incomingWebhooks', to: '/connectors', search: { section: 'incoming' }, activeOn: connectorPage('incoming') },
        ],
      },
      // Under Build: writing the worker for a topic is part of building the
      // process.
      { icon: TerminalSquare, label: 'nav.sdkSandbox', to: '/sdk', hint: 'Try the API your integration will call' },
    ],
  },
  {
    label: 'nav.sectionOperate',
    items: [
      { icon: Play, label: 'nav.instances', to: '/instances', hint: 'Running and completed processes' },
      { icon: Archive, label: 'nav.archive', to: '/archive', hint: 'Finished processes kept after their retention period' },
      { icon: PackageCheck, label: 'nav.releases', to: '/releases', hint: 'Tested versions moved to the next environment together' },
    ],
  },
  {
    label: 'nav.sectionAdminister',
    items: [
      {
        icon: ShieldCheck,
        label: 'nav.access',
        to: '/projects',
        children: [
          { label: 'nav.projects', to: '/projects' },
          { label: 'nav.organizations', to: '/organizations', activeOn: ({ pathname }) => pathname.startsWith('/organizations') },
          { label: 'nav.groups', to: '/groups' },
          { label: 'nav.platformAccess', to: '/users', hint: 'Accounts that run Metis, by role' },
          { label: 'nav.audit', to: '/audit', hint: 'Who did what across this organization', adminOnly: true },
        ],
      },
      {
        icon: Cog,
        label: 'nav.system',
        to: '/settings',
        children: [
          { label: 'nav.environments', to: '/environments', hint: 'Development, Staging and Production', adminOnly: true },
          { label: 'nav.servers', to: '/servers', hint: 'The machines running this server', adminOnly: true },
          { label: 'nav.upgrades', to: '/upgrades', hint: 'New releases of Metis', adminOnly: true },
          { label: 'nav.settings', to: '/settings' },
        ],
      },
    ],
  },
];

export function isActive(leaf: NavLeaf, location: NavLocation): boolean {
  if (leaf.activeOn) return leaf.activeOn(location);
  return leaf.to === '/' ? location.pathname === '/' : location.pathname === leaf.to || location.pathname.startsWith(`${leaf.to}/`);
}

/**
 * Where the page being looked at sits in the menu: its section, the group it is
 * under if any, and its own name, already translated. Empty for a page the
 * menu does not list. The page header shows it above the title.
 */
export function useNavTrail(): string[] {
  const { t } = useTranslation();
  // Read from the address rather than the router: a page header is drawn in
  // tests and previews with no router around it, and it is redrawn on every
  // navigation anyway, because the page under it changes.
  if (typeof window === 'undefined') return [];
  const location: NavLocation = {
    pathname: window.location.pathname,
    search: Object.fromEntries(new URLSearchParams(window.location.search)),
  };
  for (const section of sections) {
    for (const item of section.items) {
      if (item.children) {
        const child = item.children.find((c) => isActive(c, location));
        if (child) return [t(section.label), t(item.label), t(child.label)];
      } else if (isActive(item, location)) {
        return [t(section.label), t(item.label)];
      }
    }
  }
  return [];
}

