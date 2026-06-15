import { browseEntities } from '$lib/server/queries.js';

const PAGE_SIZE = 50;

export function load({ url }) {
  const search = url.searchParams.get('q') ?? '';
  const project = url.searchParams.get('project') || null;
  const sort = url.searchParams.get('sort') ?? 'thoughts';
  const dir = url.searchParams.get('dir') ?? 'desc';
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);

  const { rows, total } = browseEntities({ search, project, sort, dir, limit: PAGE_SIZE, offset });

  return { rows, total, search, project, sort, dir, offset, pageSize: PAGE_SIZE };
}
