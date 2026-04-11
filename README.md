# agent-memex

A persistent memory system for long-running AI agents, built on the [pansophist](https://github.com/dnewcome/pansophist) knowledge model. Replaces flat Markdown memory files with a structured, observer-anchored SQLite store exposed to Claude Code via an MCP server and a session-start hook.

---

## The problem with Markdown memory

Claude Code's built-in auto-memory system stores memories as Markdown files under `~/.claude/projects/<project>/memory/`. A `MEMORY.md` index points to individual files, and the harness injects their contents into each session via a `system-reminder`.

This works, but has structural limits:

- **No provenance.** Files have no record of when something was learned or why.
- **No relationships.** Connections between memories are encoded in prose, not structure.
- **No history.** Updating a memory overwrites it. There is no record of what was believed before.
- **No observers.** Every fact is treated as objective. There is no model of *who* holds a belief.
- **Retrieval is all-or-nothing.** The entire memory directory gets injected, with no relevance filtering.

agent-memex addresses all of these by grounding memory in the pansophist model.

---

## The pansophist model

Pansophist treats knowledge as *observer-dependent events*, not objective facts. The core primitives:

### Expression
The raw material — a piece of text, a fact, an idea, a URL. Expressions exist independently of any observer. Two agents can encounter the same expression; what differs is what each does with it.

### Thought
The *event* of an observer encountering an expression. Recorded with a timestamp (microsecond precision). The same expression encountered twice produces two distinct thought events — not duplicates, but distinct moments of awareness.

### Meaning
An observer's interpretation of an expression. Observer-relative and timestamped. Changing your mind creates a new meaning record; the old one is preserved. There is no "current meaning" — only a history of meanings.

### Connection
A link between two expressions, made by a specific observer, at a specific time, with an optional relation label (e.g. `"inspired"`, `"contradicts"`, `"caused by"`). Two observers can connect the same expressions differently. Both connections exist.

### Observer
Any entity capable of having a thought — a human, a named AI agent, a classifier, a summarizer. In this system, Claude Code is the observer `claude-code`.

---

## Architecture

```
~/.local/share/pansophia/pansophia.db   ← SQLite store (global, shared across all projects)

agent-memex/
  src/
    db.js       ← SQLite init + schema
    model.js    ← pansophia operations (remember, connect, recall, reflect)
    server.js   ← MCP server (tools available to the agent during sessions)
    recall.js   ← Hook script (injects memory context at session start)
```

### Data flow

**Writing memory (during a session):**
```
Agent calls remember("fact", "meaning")
  → server.js receives MCP tool call
  → model.js: ensureExpression → insertThought → insertMeaning
  → SQLite
```

**Reading memory (at session start):**
```
User submits first prompt
  → UserPromptSubmit hook fires
  → recall.js queries SQLite for recent thoughts + meanings + connections
  → outputs JSON: { "type": "inject", "content": "<pansophia-memory>...</pansophia-memory>" }
  → Claude receives memory context before seeing the user's prompt
```

---

## Schema

```sql
observer    (id, name, created_at)
expression  (id, text, created_at)
thought     (id, observer_id, expression_id, created_at)
meaning     (id, observer_id, expression_id, text, created_at)
connection  (id, observer_id, from_expression_id, to_expression_id, relation, created_at)
```

All tables are append-only by convention. Nothing is ever updated or deleted — new records supersede old ones. This preserves the full history of what was known and when.

---

## Global vs. per-project

**The database is global.** All memories written by the `claude-code` observer go into a single SQLite file at `~/.local/share/pansophia/pansophia.db`, regardless of which project you're working in.

This is intentional: cross-project context (user preferences, recurring patterns, architectural opinions) is exactly the kind of memory that benefits from persistence across sessions and projects.

**The MCP server is registered at user scope** (`~/.claude.json`), so it is available in every Claude Code session on this machine.

**The hook is also global** (in `~/.claude/settings.json`), so memory is injected at session start everywhere.

To scope memory to a project, you have two options today:

1. **Observer namespacing** — use a project-specific observer name (e.g. `claude-code/my-project`) by setting `PANSOPHIA_OBSERVER=claude-code/my-project` in the project's `.claude/settings.json` env block.
2. **Separate database** — point `PANSOPHIA_DATA_DIR` at a project-local directory (e.g. `.pansophia/`), set in project settings.

---

## MCP tools

The pansophia MCP server exposes four tools to the agent:

### `remember(expression, meaning?)`
Store something. Creates a thought (the act of encountering) and optionally a meaning (your interpretation). Keep expressions atomic — one idea per call.

```
remember("user prefers terse responses")
remember("project uses Postgres", "migrated from MySQL in Q1 2026")
```

### `connect(from, to, relation?)`
Record a relationship between two expressions. Both are created if they don't exist.

```
connect("pansophist", "agent-memex", "inspired")
connect("auth rewrite", "compliance requirement 2026", "caused by")
```

### `recall(limit?)`
Retrieve recent thoughts and meanings for the current observer. Returns a timestamped list. Default limit 50.

### `reflect(expression)`
Get the full history of thoughts, meanings, and connections for a specific expression. Useful for understanding how a belief evolved over time.

---

## Coexistence with Markdown memory

agent-memex does not remove or disable the existing Markdown-based memory system. Both can run simultaneously.

**What changes:** the `UserPromptSubmit` hook now fires before every prompt, injecting a `<pansophia-memory>` block from SQLite. The existing `MEMORY.md`-based system continues to inject its own context via the harness's built-in mechanism.

**Recommended migration path:**
1. Keep existing MD files in place for now — they still work.
2. Use the `remember` and `connect` tools going forward for new memories.
3. Once you have confidence in the SQLite store, export the MD memories (see below) and stop writing new MD files.
4. Disable the built-in auto-memory by setting `"autoMemoryEnabled": false` in `~/.claude/settings.json` when ready to fully cut over.

---

## Exporting to Markdown

To generate a Markdown snapshot of the database (useful for auditing, migration, or seeding the old system):

```bash
node -e "
import('./src/model.js').then(({ recall, recallConnections }) => {
  const rows = recall('claude-code', 500);
  const conns = recallConnections('claude-code');

  const lines = ['# Pansophia Memory Export\n'];
  lines.push('## Memories\n');
  for (const r of rows) {
    if (r.meaning) lines.push(\`- **\${r.expression}**: \${r.meaning}\`);
    else lines.push(\`- \${r.expression}\`);
  }
  if (conns.length) {
    lines.push('\n## Connections\n');
    for (const c of conns) {
      const rel = c.relation ? \` [\${c.relation}]\` : ' →';
      lines.push(\`- \${c.from_expression}\${rel} \${c.to_expression}\`);
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
});
" > memory-export.md
```

To import an existing MEMORY.md or individual memory files into pansophia, parse the frontmatter and body structure and call `remember()` for each entry. A migration script is a natural next step (see Future Work).

---

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `PANSOPHIA_OBSERVER` | `claude-code` | The observer name. Change to namespace by project or agent. |
| `PANSOPHIA_DATA_DIR` | `~/.local/share/pansophia` | Directory for the SQLite database. |
| `PANSOPHIA_RECALL_LIMIT` | `80` | Max memories injected per session by the recall hook. |

Set these in the MCP server registration (`~/.claude.json`) or in project-level `env` settings.

---

## Swapping the persistence backend

The persistence boundary is `src/db.js` and `src/model.js`. `db.js` initializes the connection and schema; `model.js` performs all reads and writes through that connection.

To replace SQLite with a different backend, rewrite `model.js` against the new store while preserving the same function signatures:

```javascript
// The interface model.js must implement:
export function ensureObserver(name)                           // → observer row
export function remember(observerName, expression, meaning)   // → { thoughtId, meaningId }
export function connect(observerName, from, to, relation)     // → { connectionId }
export function recall(observerName, limit)                   // → [{ expression, meaning, thought_at }]
export function recallConnections(observerName, expression?)  // → [{ from_expression, to_expression, relation }]
export function reflect(observerName, expression)             // → { expression, thoughts, meanings, connections }
```

### Postgres

Drop in `postgres` or `pg` and rewrite `db.js` to connect via a pool. The SQL in `model.js` is standard enough to port directly. Postgres adds concurrent writes (useful if multiple agents share one store) and full-text search via `tsvector`.

### Vector database (pgvector, Qdrant, Weaviate, ChromaDB)

The limiting factor of the current system is that recall is recency-based, not semantic. When you have hundreds of memories, you want to retrieve what's *relevant to the current prompt*, not just the most recent.

The natural path:

1. **Embed at write time.** In `remember()`, after inserting the expression/thought/meaning, generate an embedding for `expression + meaning` (e.g. via the Anthropic embeddings API or a local model) and store it alongside the record.
2. **Query at recall time.** In `recall.js`, embed the current prompt (passed in via stdin from the hook — the hook receives the prompt text as JSON), then do a nearest-neighbor search to retrieve the top-k most relevant memories instead of the top-k most recent.
3. **Keep SQLite as the source of truth.** The vector index is a retrieval layer on top of the relational store, not a replacement. Provenance, connections, and history live in SQLite; the vector index just accelerates relevance-ranked lookup.

For a fully local setup, `pgvector` on a local Postgres or `ChromaDB` (Python/HTTP) are the lowest-friction options. For a service-backed setup, Qdrant or Weaviate offer more retrieval options (hybrid BM25 + vector, filtering by metadata).

### Remote service (Zep, Mem0, Letta)

If you want to experiment with an existing agent memory service, `model.js` can be rewritten as a thin HTTP client. The pansophist model maps onto most of these services:

| Pansophist primitive | Zep | Mem0 |
|---|---|---|
| Expression | entity / fact | memory entry |
| Thought | session message | add memory |
| Meaning | entity summary | metadata |
| Connection | graph edge | relationship |

The observer model (and especially the append-only, no-overwrite property) is the part most services don't natively support — you'd lose history fidelity when adapting to them.

---

## Future work

### Migration tool
A script to import existing `MEMORY.md` + individual `.md` memory files into pansophia. Parse frontmatter (`name`, `description`, `type`) as the expression; parse the body as the meaning. Preserve file `mtime` as the thought timestamp.

### Reflection / synthesis
Implement a background process (or a `Stop` hook) that periodically reviews recent thoughts and synthesizes higher-order observations — similar to the "reflection tree" in the Generative Agents paper (Park et al., 2023). The synthesized observations would be stored as new meanings held by a secondary observer (e.g. `claude-code/reflector`), keeping them distinct from raw remembered facts.

### Relevance-ranked recall
Replace the recency-based recall in `recall.js` with embedding-based similarity search. The hook receives the user's prompt as JSON on stdin — embed it and retrieve the top-k semantically relevant memories rather than the top-k most recent.

### Importance scoring at write time
Assign an importance score to each expression at the time it's remembered (via a lightweight LLM call or heuristic). Use importance × recency as the recall ranking, so high-value old memories aren't crowded out by trivial recent ones.

### Multi-agent and multi-observer
The schema already supports multiple observers. A team setup could have each agent (or each human collaborator) write under their own observer name, with connection records capturing cross-agent relationships ("agent-A believes X, agent-B contradicts it"). A shared Postgres backend would enable this naturally.

### Web UI / inspector
A simple local web UI (e.g. an Express server + plain HTML) to browse expressions, view thought timelines, inspect connection graphs, and manually add or annotate memories. Useful for auditing what the agent has learned and pruning noise.

### Decay and archival
Add a soft-delete / archive mechanism: not true deletion (the append-only property is a feature), but a way to mark memories as low-priority so they stop appearing in routine recall. Could be modeled as a `meaning` record with a special `archived` relation, or as a separate `annotation` table.

### Project-scoped memory with inheritance
A more principled scoping model: project-level memories that are visible only within a specific working directory, plus global memories that are always visible. Implemented as two observer namespaces with a merge step in recall — global memories first, then project-local ones layered on top.
