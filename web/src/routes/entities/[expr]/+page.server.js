import { error } from '@sveltejs/kit';
import { entityDetail } from '$lib/server/queries.js';

export function load({ params, url }) {
  const detail = entityDetail(params.expr);
  if (!detail) throw error(404, `No record of "${params.expr}"`);
  return { detail, project: url.searchParams.get('project') || null };
}
