/**
 * One search box for the whole project: processes, decisions and the pages of
 * the app, from the top bar or with Ctrl+K / Cmd+K.
 *
 * It reads the lists the app already loads (the first 200 processes and every
 * decision summary), so it needs nothing new from the engine. The results are a
 * lazily loaded module, mounted with the dialog, so neither their code nor the
 * lists cost anything until someone opens the search.
 */
import { Kbd, Loader, Modal, UnstyledButton } from '@mantine/core';
import { useDisclosure, useHotkeys } from '@mantine/hooks';
import { Search } from 'lucide-react';
import { lazy, Suspense } from 'react';

import classes from './GlobalSearch.module.css';

const SearchPanel = lazy(() => import('./GlobalSearchPanel'));

export function GlobalSearch() {
  const [opened, { open, close }] = useDisclosure(false);
  useHotkeys([['mod+K', open]]);

  return (
    <>
      <UnstyledButton className={classes.trigger} onClick={open} aria-label="Search processes, decisions and pages">
        <Search size={15} aria-hidden />
        <span className={classes.placeholder}>Search processes, decisions, pages</span>
        <Kbd size="xs" className={classes.kbd}>⌘K</Kbd>
      </UnstyledButton>
      <Modal
        opened={opened}
        onClose={close}
        withCloseButton={false}
        padding={0}
        radius="lg"
        size={620}
        yOffset="8vh"
        title={null}
        aria-label="Search"
      >
        {opened && (
          <Suspense fallback={<Loader size="sm" m="lg" />}>
            <SearchPanel onDone={close} />
          </Suspense>
        )}
      </Modal>
    </>
  );
}

