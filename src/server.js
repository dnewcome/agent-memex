#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { remember, connect, recall, reflect, recallConnections, entityContext, matchEntitiesInText } from './model.js';

const OBSERVER = process.env.PANSOPHIA_OBSERVER ?? 'claude-code';

const server = new McpServer({
  name: 'pansophia',
  version: '0.1.0',
});

server.tool(
  'remember',
  `Record an encounter with an expression. Creates a thought (the event) and optionally a meaning (your interpretation).

Use for: (a) noting an encounter with an existing entity by its canonical name, (b) recording a new atomic idea.

Naming discipline: prefer short, canonical, hyphenated entity names (e.g. "agent-memex", "alice-jones"). These become matchable at retrieval time. Free-text goes in \`meaning\`, not in \`expression\`.

Primitive choice: use \`remember\` for events and interpretations. Use \`connect\` for durable classifications (type, status, ownership). If the observation is a judgment ("X is going well"), that belongs in \`meaning\`. If it's a durable fact ("X is a project"), prefer \`connect\` with a relation label.`,
  {
    expression: z.string().describe('The entity or idea being encountered. For existing entities, use the exact canonical name. For new ideas, keep it atomic.'),
    meaning: z.string().optional().describe('Your interpretation, rationale, or take. Observer-relative and subjective by design.'),
  },
  async ({ expression, meaning }) => {
    const result = remember(OBSERVER, expression, meaning ?? null);
    return {
      content: [{
        type: 'text',
        text: `Remembered. thought=${result.thoughtId}${result.meaningId ? ` meaning=${result.meaningId}` : ''}`,
      }],
    };
  }
);

server.tool(
  'connect',
  `Assert a durable relationship or classification between two expressions. Both are created if they don't exist.

Use for attributes: \`connect("agent-memex", "project", "type")\`, \`connect("agent-memex", "active", "status")\`, \`connect("agent-memex", "/home/dan/...", "path")\`.

Use for relationships: \`connect("agent-memex", "pansophist", "inspired_by")\`, \`connect("alice", "acme-corp", "works_at")\`.

Prefer a consistent vocabulary for relation labels. Common ones: \`type\`, \`status\`, \`path\`, \`lang\`, \`owner\`, \`depends_on\`, \`inspired_by\`, \`part_of\`. Append-only: changing a value (e.g. status) creates a new connection; the old one is preserved as history.

Do not use \`connect\` for derivable facts (last-touched date, session count) — those come from the thought log.`,
  {
    from: z.string().describe('The source entity (canonical name).'),
    to: z.string().describe('The target — either another entity name or an attribute value.'),
    relation: z.string().optional().describe('The relation label. Prefer consistent vocabulary (type, status, path, lang, owner, depends_on, inspired_by, part_of).'),
  },
  async ({ from, to, relation }) => {
    const result = connect(OBSERVER, from, to, relation ?? null);
    return {
      content: [{
        type: 'text',
        text: `Connected. connection=${result.connectionId}`,
      }],
    };
  }
);

server.tool(
  'recall',
  'Retrieve memories. Without arguments, returns recent thoughts and meanings across all entities. With `about`, returns focused context for one entity: its latest attributes, recent thoughts, latest meaning, and related entities.',
  {
    limit: z.number().int().min(1).max(500).optional().describe('Max records for recency mode. Default 50.'),
    about: z.string().optional().describe('Entity name to focus on. Case-insensitive word-boundary match against known expressions. Use this when you know what you want to recall about.'),
  },
  async ({ limit, about }) => {
    if (about) {
      let target = about;
      const direct = entityContext(OBSERVER, about);
      let ctx = direct;
      if (!ctx) {
        const matches = matchEntitiesInText(OBSERVER, about, { maxResults: 1, minLength: 2 });
        if (matches.length > 0) {
          target = matches[0].expression;
          ctx = entityContext(OBSERVER, target);
        }
      }
      if (!ctx) {
        return { content: [{ type: 'text', text: `No entity matching "${about}".` }] };
      }
      const lines = [`Entity: ${ctx.expression}`];
      if (target !== about) lines[0] += ` (fuzzy match for "${about}")`;
      lines.push('');
      for (const c of ctx.outgoing) {
        const rel = c.relation ?? '→';
        lines.push(`  ${rel}: ${c.to_expression} [${c.created_at}]`);
      }
      if (ctx.thoughtCount > 0) {
        lines.push('');
        lines.push(`Encountered ${ctx.thoughtCount} time(s). Recent:`);
        for (const t of ctx.thoughts) lines.push(`  ${t.created_at}`);
      }
      if (ctx.meanings.length) {
        lines.push('');
        lines.push('Meanings:');
        for (const m of ctx.meanings) lines.push(`  [${m.created_at}] ${m.text}`);
      }
      if (ctx.incoming.length) {
        lines.push('');
        lines.push('Referenced by:');
        for (const c of ctx.incoming) {
          const rel = c.relation ? ` [${c.relation}]` : '';
          lines.push(`  ${c.from_expression}${rel}`);
        }
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    const rows = recall(OBSERVER, limit ?? 50);
    if (rows.length === 0) {
      return { content: [{ type: 'text', text: 'No memories found.' }] };
    }
    const text = rows.map(r =>
      r.meaning
        ? `[${r.thought_at}] ${r.expression}\n  → ${r.meaning}`
        : `[${r.thought_at}] ${r.expression}`
    ).join('\n\n');
    return { content: [{ type: 'text', text }] };
  }
);

server.tool(
  'reflect',
  'Get the full history of thoughts, meanings, and connections for a specific expression.',
  {
    expression: z.string().describe('The expression to reflect on.'),
  },
  async ({ expression }) => {
    const result = reflect(OBSERVER, expression);
    if (!result) {
      return { content: [{ type: 'text', text: `No record of "${expression}".` }] };
    }
    const lines = [`Expression: ${result.expression}\n`];
    if (result.thoughts.length) {
      lines.push(`Encountered ${result.thoughts.length} time(s):`);
      result.thoughts.forEach(t => lines.push(`  ${t.created_at}`));
    }
    if (result.meanings.length) {
      lines.push(`\nMeanings:`);
      result.meanings.forEach(m => lines.push(`  [${m.created_at}] ${m.text}`));
    }
    if (result.connections.length) {
      lines.push(`\nConnections:`);
      result.connections.forEach(c => {
        const rel = c.relation ? ` [${c.relation}]` : '';
        lines.push(`  ${c.from_expression}${rel} → ${c.to_expression}`);
      });
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
