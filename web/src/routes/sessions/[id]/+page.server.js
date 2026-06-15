import { error } from '@sveltejs/kit';
import { sessionMeta } from '$lib/server/sessions.js';
import { memoriesBySession } from '$lib/server/queries.js';

export function load({ params }) {
  const meta = sessionMeta(params.id);
  const memories = memoriesBySession(params.id);
  // A session may exist only in the DB (transcript pruned) or only on disk (no
  // memories yet). Surface whichever we have; 404 only if neither exists.
  if (!meta && memories.thoughts.length === 0 && memories.connections.length === 0) {
    throw error(404, `No session or memories for "${params.id}"`);
  }
  return { id: params.id, meta, memories };
}
