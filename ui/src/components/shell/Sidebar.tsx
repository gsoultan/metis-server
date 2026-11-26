import { Tooltip, UnstyledButton } from '@mantine/core';
import { Link, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { hasRole } from '../../domain/access';
import { PRIVILEGED_ROLE } from '../../domain/roles';
import { useViewerAccess } from '../../hooks/useViewerAccess';
import { useAppStore } from '../../store/useAppStore';
import { AccountMenu } from './AccountMenu';
import { BuildVersion } from './BuildVersion';
import classes from './Sidebar.module.css';
import { useTranslation } from '../../i18n/context';
import { isActive, sections, type NavItem, type NavLocation } from './navigation';

/**
 * Primary navigation.
 *
 * The previous version listed ten destinations flat, in no order a user could
 * predict — Dashboard, Organizations, Projects, Inbox, Tasks, Instances,
 * Models, Connectors, Users, Groups. A person doing their daily work and a
 * person administering the platform saw the same undifferentiated list, and
 * neither could find their half of it quickly.
 *
 * Grouping here follows what someone came to *do*, not how the backend is
 * organised:
 *
 *   Work      — what needs me today (the majority of sessions end here)
 *   Build     — designing processes and decisions
 *   Operate   — watching what is running
 *   Administer — people and tenancy, visited rarely
 *
 * Ordered by frequency of use, because the top of a list is the cheapest place
 * to reach.
 */

function useNavLocation(): NavLocation {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search as Record<string, unknown> });
  return { pathname, search };
}


function withHint(hint: string | undefined, label: string, collapsed: boolean, node: React.ReactElement) {
  if (collapsed) {
    return (
      <Tooltip label={hint ? `${label} — ${hint}` : label} position="right" withArrow openDelay={200}>
        {node}
      </Tooltip>
    );
  }
  if (hint) {
    return (
      <Tooltip label={hint} position="right" withArrow openDelay={600}>
        {node}
      </Tooltip>
    );
  }
  return node;
}

function NavLink({ item, collapsed, location }: { item: NavItem; collapsed: boolean; location: NavLocation }) {
  const { t } = useTranslation();
  const label = t(item.label);
  const active = isActive(item, location);
  return withHint(
    item.hint,
    label,
    collapsed,
    <Link
      to={item.to}
      search={item.search}
      className={classes.link}
      activeProps={{}}
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      // Collapsed, the label is not rendered; the accessible name comes from here.
      aria-label={collapsed ? label : undefined}
    >
      <item.icon className={classes.linkIcon} size={18} strokeWidth={1.75} aria-hidden />
      {!collapsed && <span className={classes.linkLabel}>{label}</span>}
    </Link>,
  );
}

function NavGroup({ item, collapsed, location }: { item: NavItem; collapsed: boolean; location: NavLocation }) {
  const { t } = useTranslation();
  const label = t(item.label);
  const children = item.children ?? [];
  const holdsActive = children.some((child) => isActive(child, location));
  // Open while one of its pages is showing; a click opens or closes it by hand
  // until the next page is chosen elsewhere.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? holdsActive;

  if (collapsed) {
    // The rail has no room for a sub-menu: the icon goes to the group's first
    // page, and the tooltip names the group.
    const first = children[0];
    return withHint(
      undefined,
      label,
      true,
      <Link
        to={first?.to ?? item.to}
        search={first?.search}
        className={classes.link}
        activeProps={{}}
        data-active={holdsActive || undefined}
        aria-label={label}
      >
        <item.icon className={classes.linkIcon} size={18} strokeWidth={1.75} aria-hidden />
      </Link>,
    );
  }

  const listId = `nav-group-${item.label}`;
  return (
    <div>
      <UnstyledButton
        className={classes.link}
        data-parent-active={holdsActive || undefined}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setToggled(!open)}
      >
        <item.icon className={classes.linkIcon} size={18} strokeWidth={1.75} aria-hidden />
        <span className={classes.linkLabel}>{label}</span>
        <ChevronRight size={14} className={classes.chevron} data-open={open || undefined} aria-hidden />
      </UnstyledButton>
      {open && (
        <div id={listId} className={classes.subList}>
          {children.map((child) => {
            const childActive = isActive(child, location);
            const childLabel = t(child.label);
            return (
              <div key={child.label}>
                {withHint(
                  child.hint,
                  childLabel,
                  false,
                  <Link
                    to={child.to}
                    search={child.search}
                    className={classes.subLink}
                    activeProps={{}}
                    data-active={childActive || undefined}
                    aria-current={childActive ? 'page' : undefined}
                  >
                    {childLabel}
                  </Link>,
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { sidebarExpanded, toggleSidebar } = useAppStore();
  const { t } = useTranslation();
  const collapsed = !sidebarExpanded;
  const isAdministrator = hasRole(useViewerAccess(), PRIVILEGED_ROLE);
  const location = useNavLocation();
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) => !item.adminOnly || isAdministrator)
        .map((item) =>
          item.children
            ? { ...item, children: item.children.filter((child) => !child.adminOnly || isAdministrator) }
            : item,
        )
        .filter((item) => !item.children || item.children.length > 0),
    }))
    .filter((section) => section.items.length > 0);

  return (
    // Not <nav>: AppShell.Navbar is already the navigation landmark, and a
    // nested one left two with the same name, which a screen reader offers as
    // two indistinguishable choices. The name lives on the outer element.
    <div className={`${classes.navbar} ${collapsed ? classes.collapsed : ''}`}>

      <div className={classes.scroll}>
        {visibleSections.map((section) => (
          <div key={section.label}>
            {collapsed ? (
              <div className={classes.sectionRule} aria-hidden />
            ) : (
              <div className={classes.sectionLabel}>{t(section.label)}</div>
            )}
            {section.items.map((item) =>
              item.children ? (
                <NavGroup key={item.label} item={item} collapsed={collapsed} location={location} />
              ) : (
                <NavLink key={item.label} item={item} collapsed={collapsed} location={location} />
              ),
            )}
          </div>
        ))}
      </div>

      <div className={classes.footer}>
        {/* The version and the collapse control on one quiet row, then who is
            signed in. */}
        <div className={classes.footerRow} style={collapsed ? { flexDirection: 'column', paddingInline: 0 } : undefined}>
          <BuildVersion collapsed={collapsed} />
          <Tooltip label={collapsed ? 'Expand navigation' : t('nav.collapse')} position="right" withArrow openDelay={300}>
            <button
              type="button"
              className={classes.collapseToggle}
              onClick={toggleSidebar}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-expanded={sidebarExpanded}
            >
              {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            </button>
          </Tooltip>
        </div>
        <AccountMenu collapsed={collapsed} />
      </div>
    </div>
  );
}
