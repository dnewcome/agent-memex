#!/usr/bin/env node
/**
 * recall.js — prints remembered context as a system-prompt injection block.
 * Used by the Claude Code UserPromptSubmit hook.
 *
 * Reads the hook payload (JSON) from stdin. If it contains a `prompt`, scans
 * the prompt for known entity names and surfaces their context *before* the
 * generic recency-based memory block.
 *
 * Output: JSON { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "..." } } on stdout.
 * Exits silently with no output if there is nothing to inject.
 */
import { recallAggregated, recallConnectionsAggregated, matchEntitiesInText, entityContext } from './model.js';
import { findProjectSlug } from './project.js';

const OBSERVER = process.env.PANSOPHIA_OBSERVER ?? 'claude-code';
const LIMIT = parseInt(process.env.PANSOPHIA_RECALL_LIMIT ?? '80', 10);
const MATCH_LIMIT = parseInt(process.env.PANSOPHIA_MATCH_LIMIT ?? '3', 10);

async function readStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function formatEntityBlock(ctx) {
  const lines = [ctx.expression];

  const attrs = new Map();
  const untypedOut = [];
  for (const c of ctx.outgoing) {
    if (c.relation) {
      if (!attrs.has(c.relation)) attrs.set(c.relation, c.to_expression);
    } else {
      untypedOut.push(c.to_expression);
    }
  }
  for (const [rel, val] of attrs) lines.push(`  ${rel}: ${val}`);
  if (untypedOut.length) {
    lines.push(`  connected to: ${untypedOut.slice(0, 3).join(', ')}`);
  }

  if (ctx.thoughtCount > 0) {
    const last = ctx.thoughts[0]?.created_at?.slice(0, 10);
    lines.push(`  encountered ${ctx.thoughtCount} time(s), last ${last}`);
  }

  if (ctx.meanings.length) {
    const m = ctx.meanings[0];
    const date = m.created_at.slice(0, 10);
    lines.push(`  belief (${date}): "${m.text}"`);
  }

  if (ctx.incoming.length) {
    const inBits = ctx.incoming.slice(0, 3).map(c =>
      c.relation ? `${c.from_expression} [${c.relation}]` : c.from_expression
    );
    lines.push(`  referenced by: ${inBits.join(', ')}`);
  }

  return lines.join('\n');
}

const payload = await readStdin();
const prompt = typeof payload?.prompt === 'string' ? payload.prompt : null;
const project = findProjectSlug(payload?.cwd ?? process.cwd());

const lines = ['<pansophia-memory>'];
if (project) lines.push(`Project scope: ${project} (plus untagged globals)`);
let emitted = false;

if (prompt) {
  const matches = matchEntitiesInText(OBSERVER, prompt, { maxResults: MATCH_LIMIT });
  if (matches.length > 0) {
    lines.push('Currently in context (entities mentioned in your prompt):');
    for (const m of matches) {
      const ctx = entityContext(OBSERVER, m.expression);
      if (!ctx) continue;
      lines.push('');
      lines.push(formatEntityBlock(ctx));
      emitted = true;
    }
  }
}

const rows = recallAggregated(OBSERVER, LIMIT, project);
const connections = recallConnectionsAggregated(OBSERVER, project);

function formatStamp(n, lastAt) {
  const date = lastAt ? lastAt.slice(0, 10) : null;
  if (n > 1) return ` (×${n}, last ${date})`;
  if (date) return ` (${date})`;
  return '';
}

if (rows.length > 0) {
  if (emitted) lines.push('');
  lines.push('Memories:');
  for (const r of rows) {
    const stamp = formatStamp(r.thought_count, r.last_thought_at);
    if (r.meaning) lines.push(`- ${r.expression}: ${r.meaning}${stamp}`);
    else lines.push(`- ${r.expression}${stamp}`);
  }
  emitted = true;
}

if (connections.length > 0) {
  lines.push('');
  lines.push('Connections:');
  for (const c of connections) {
    const rel = c.relation ? ` [${c.relation}]` : ' →';
    const stamp = formatStamp(c.n, c.last_at);
    lines.push(`- ${c.from_expression}${rel} ${c.to_expression}${stamp}`);
  }
  emitted = true;
}

if (!emitted) process.exit(0);

lines.push('</pansophia-memory>');

const content = lines.join('\n');
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: content,
  },
}) + '\n');
