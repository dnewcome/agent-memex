#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { remember, connect, recall, reflect, recallConnections } from './model.js';

const OBSERVER = process.env.PANSOPHIA_OBSERVER ?? 'claude-code';

const server = new McpServer({
  name: 'pansophia',
  version: '0.1.0',
});

server.tool(
  'remember',
  'Store something worth remembering. Creates a thought (the act of encountering an expression) and optionally a meaning (your interpretation of it).',
  {
    expression: z.string().describe('The thing being remembered — a fact, preference, idea, or piece of context. Keep it atomic.'),
    meaning: z.string().optional().describe('Your interpretation or why this matters. Observer-relative.'),
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
  'Record a connection between two expressions. Both are created if they don\'t exist. The relation label is observer-relative.',
  {
    from: z.string().describe('The source expression.'),
    to: z.string().describe('The target expression.'),
    relation: z.string().optional().describe('How they relate — e.g. "is a", "contradicts", "caused by", "reminds me of".'),
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
  'Retrieve recent thoughts and meanings. Use this to check what has been remembered across sessions.',
  {
    limit: z.number().int().min(1).max(500).optional().describe('Max records to return. Default 50.'),
  },
  async ({ limit }) => {
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
