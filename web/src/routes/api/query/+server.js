import { json } from '@sveltejs/kit';
import { runSql } from '$lib/server/queries.js';

export async function POST({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, { status: 400 });
  }
  const sql = (body?.sql ?? '').trim();
  if (!sql) return json({ error: 'Empty query' }, { status: 400 });

  return json(runSql(sql));
}
