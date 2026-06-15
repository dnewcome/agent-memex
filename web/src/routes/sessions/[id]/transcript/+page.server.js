import { error } from '@sveltejs/kit';
import { readTranscript, sessionMeta } from '$lib/server/sessions.js';

export function load({ params }) {
  const transcript = readTranscript(params.id);
  if (!transcript) throw error(404, `No transcript on disk for "${params.id}"`);
  const meta = sessionMeta(params.id);
  return { id: params.id, transcript, meta };
}
