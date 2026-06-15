import { connectionsAggregated, relationVocab } from '$lib/server/queries.js';

export function load({ url }) {
  const relation = url.searchParams.get('relation') || null;
  const project = url.searchParams.get('project') || null;
  const search = url.searchParams.get('q') ?? '';
  const from = url.searchParams.get('from') || null;
  const to = url.searchParams.get('to') || null;

  return {
    relation,
    project,
    search,
    from,
    to,
    // vocab reflects the active creation-date range + project scope: this list IS
    // "relations created in <range>" when a range is set.
    vocab: relationVocab({ from, to, project }),
    rows: connectionsAggregated({ relation, project, search, from, to, limit: 300 })
  };
}
