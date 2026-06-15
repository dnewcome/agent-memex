import { listSessions, projectCounts } from '$lib/server/sessions.js';
import { sessionMemoryCounts } from '$lib/server/queries.js';

const PAGE_SIZE = 50;

export function load({ url }) {
  const search = url.searchParams.get('q') ?? '';
  const project = url.searchParams.get('project') || null;
  const hideDistill = url.searchParams.get('hideDistill') === '1';
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);

  let { sessions, total } = listSessions({ search, project, limit: PAGE_SIZE, offset });
  if (hideDistill) sessions = sessions.filter((s) => !s.isDistillation);

  const counts = sessionMemoryCounts(sessions.map((s) => s.id));
  sessions = sessions.map((s) => ({ ...s, memory: counts[s.id] }));

  return {
    sessions,
    total,
    search,
    project,
    hideDistill,
    offset,
    pageSize: PAGE_SIZE,
    projects: projectCounts()
  };
}
