import { stats } from '$lib/server/queries.js';

export function load() {
  const s = stats();
  return { counts: s.counts, projects: s.projects, observers: s.observers };
}
