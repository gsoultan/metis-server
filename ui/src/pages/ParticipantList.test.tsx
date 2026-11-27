/**
 * The People page, rendered, with its reads stood in for.
 *
 * The directory can be thousands of people, so the page shows one page of it
 * and asks the server to search. What is tested here is that wiring: the page
 * asks for a page with the search typed, says where the page sits in the
 * whole, and still works against an engine that answers everybody unpaged.
 */
import { describe, expect, it, mock } from 'bun:test';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Participant } from '../domain/participantImport';

interface PageInfo {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const stage: { calls: unknown[]; rows: Participant[]; pageInfo?: PageInfo } = { calls: [], rows: [] };

// The rest of the module stays as it is, for any other test file that imports
// it: a module stood in for here stays stood in for the rest of the run.
const participantHooks = await import('../hooks/useParticipants');
mock.module('../hooks/useParticipants', () => ({
  ...participantHooks,
  useParticipantsPage: (query: unknown) => {
    stage.calls.push(query);
    return {
      data: { participants: stage.rows, err: '', pageInfo: stage.pageInfo },
      isLoading: false,
      error: null,
      refetch: () => {},
    };
  },
}));

const { ParticipantList } = await import('./ParticipantList');

const person = (username: string): Participant => ({
  id: `id-${username}`,
  username,
  display_name: username.toUpperCase(),
  email: `${username}@example.com`,
  active: true,
  groups: [],
} as Participant);

function render(): string {
  stage.calls = [];
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider>
        <ParticipantList />
      </MantineProvider>
    </QueryClientProvider>,
  );
}

/** The markup as text, so an assertion reads the way the page does. */
const textOf = (html: string) => html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the People page', () => {
  it('asks for the first page, with no search, at 25 a page', () => {
    stage.rows = [];
    stage.pageInfo = { total: 0, page: 1, pageSize: 25, hasMore: false };
    render();
    expect(stage.calls[0]).toEqual({ page: 1, pageSize: 25, search: '' });
  });

  it('says where the page sits in the whole and offers the others', () => {
    stage.rows = Array.from({ length: 25 }, (_, i) => person(`p${String(i).padStart(2, '0')}`));
    stage.pageInfo = { total: 60, page: 1, pageSize: 25, hasMore: true };
    const text = textOf(render());
    expect(text).toContain('60 in this project');
    expect(text).toContain('1–25 of 60 people');
    expect(render()).toContain('aria-label="Next page"');
  });

  it('shows no page controls when everybody fits on one page', () => {
    stage.rows = [person('ada'), person('bob')];
    stage.pageInfo = { total: 2, page: 1, pageSize: 25, hasMore: false };
    const html = render();
    expect(textOf(html)).toContain('2 in this project');
    expect(html).not.toContain('aria-label="Next page"');
  });

  it('shows everybody an engine that does not page answers, without page controls', () => {
    stage.rows = [person('ada'), person('bob'), person('carol')];
    stage.pageInfo = undefined;
    const html = render();
    expect(textOf(html)).toContain('3 in this project');
    expect(textOf(html)).toContain('CAROL');
    expect(html).not.toContain('aria-label="Next page"');
  });

  it('says the project has nobody yet when the directory is empty', () => {
    stage.rows = [];
    stage.pageInfo = { total: 0, page: 1, pageSize: 25, hasMore: false };
    expect(textOf(render())).toContain('Nobody here yet');
  });
});
