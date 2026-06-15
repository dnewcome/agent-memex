import { activity, topEntities, relationVocab, dataQuality } from '$lib/server/queries.js';

export function load({ url }) {
  const project = url.searchParams.get('project') || null;
  return {
    project,
    activity: activity(120),
    topEntities: topEntities(15, project),
    relations: relationVocab(),
    quality: dataQuality()
  };
}
