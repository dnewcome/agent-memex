#!/usr/bin/env node
/**
 * recall.js — prints remembered context as a system-prompt injection block.
 * Used by the Claude Code UserPromptSubmit hook to seed memory at session start.
 *
 * Output: JSON { "type": "inject", "content": "..." } written to stdout.
 * Exits silently with no output if there are no memories.
 */
import { recall, recallConnections } from './model.js';

const OBSERVER = process.env.PANSOPHIA_OBSERVER ?? 'claude-code';
const LIMIT = parseInt(process.env.PANSOPHIA_RECALL_LIMIT ?? '80', 10);

const rows = recall(OBSERVER, LIMIT);
const connections = recallConnections(OBSERVER);

if (rows.length === 0 && connections.length === 0) {
  process.exit(0);
}

const lines = ['<pansophia-memory>'];

if (rows.length > 0) {
  // Deduplicate: show most recent meaning per expression
  const seen = new Map();
  for (const r of rows) {
    if (!seen.has(r.expression)) {
      seen.set(r.expression, r);
    }
  }
  lines.push('Memories:');
  for (const [expression, r] of seen) {
    if (r.meaning) {
      lines.push(`- ${expression}: ${r.meaning}`);
    } else {
      lines.push(`- ${expression}`);
    }
  }
}

if (connections.length > 0) {
  lines.push('\nConnections:');
  for (const c of connections) {
    const rel = c.relation ? ` [${c.relation}]` : ' →';
    lines.push(`- ${c.from_expression}${rel} ${c.to_expression}`);
  }
}

lines.push('</pansophia-memory>');

const content = lines.join('\n');
process.stdout.write(JSON.stringify({ type: 'inject', content }) + '\n');
