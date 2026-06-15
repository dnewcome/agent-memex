<script>
  import { num } from '$lib/format.js';

  const PRESETS = [
    { label: 'Schema', sql: "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name" },
    { label: 'Top relations', sql: 'SELECT relation, COUNT(*) n FROM connection GROUP BY relation ORDER BY n DESC LIMIT 25' },
    { label: 'Most-encountered entities', sql: 'SELECT e.text, COUNT(*) n, MAX(t.created_at) last_seen\nFROM thought t JOIN expression e ON e.id = t.expression_id\nGROUP BY e.id ORDER BY n DESC LIMIT 25' },
    { label: 'Touched this week', sql: "SELECT e.text, COUNT(*) n\nFROM thought t JOIN expression e ON e.id = t.expression_id\nWHERE t.created_at >= datetime('now','-7 days')\nGROUP BY e.id ORDER BY n DESC" },
    { label: 'One-off relations', sql: 'SELECT relation, COUNT(*) n FROM connection GROUP BY relation HAVING n = 1 ORDER BY relation' },
    { label: 'Meanings (latest)', sql: 'SELECT e.text, m.text AS meaning, m.created_at\nFROM meaning m JOIN expression e ON e.id = m.expression_id\nORDER BY m.created_at DESC LIMIT 50' }
  ];

  let sql = $state(PRESETS[1].sql);
  let result = $state(null);
  let error = $state(null);
  let loading = $state(false);
  let elapsed = $state(0);

  async function run() {
    loading = true;
    error = null;
    const t0 = performance.now();
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql })
      });
      const data = await res.json();
      elapsed = Math.round(performance.now() - t0);
      if (data.error) {
        error = data.error;
        result = null;
      } else {
        result = data;
      }
    } catch (e) {
      error = String(e);
      result = null;
    } finally {
      loading = false;
    }
  }

  function preset(p) {
    sql = p.sql;
    run();
  }

  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  }

  function cell(v) {
    if (v === null) return '∅';
    return String(v);
  }
</script>

<h1>Query</h1>
<p class="muted small">Read-only SQL against <code>pansophia.db</code>. Writes are rejected by the database. <code>⌘/Ctrl + Enter</code> to run.</p>

<div class="presets">
  {#each PRESETS as p}<button class="ghost" onclick={() => preset(p)}>{p.label}</button>{/each}
</div>

<textarea bind:value={sql} rows="6" spellcheck="false" onkeydown={onKey}></textarea>
<div class="bar">
  <button onclick={run} disabled={loading}>{loading ? 'Running…' : 'Run'}</button>
  {#if result}<span class="muted small">{num(result.rows.length)} row{result.rows.length === 1 ? '' : 's'}{result.truncated ? ' (capped at 2000)' : ''} · {elapsed}ms</span>{/if}
</div>

{#if error}
  <div class="panel err"><strong>Error:</strong> {error}</div>
{/if}

{#if result}
  {#if result.rows.length === 0}
    <p class="muted">No rows.</p>
  {:else}
    <div class="panel nopad scroll">
      <table>
        <thead><tr>{#each result.columns as c}<th>{c}</th>{/each}</tr></thead>
        <tbody>
          {#each result.rows as row}
            <tr>{#each result.columns as c}<td class:nullcell={row[c] === null}>{cell(row[c])}</td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

<style>
  .presets { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
  .bar { display: flex; align-items: center; gap: 12px; margin: 10px 0 16px; }
  .err { border-color: var(--bad); color: var(--bad); font-family: var(--mono); font-size: 0.84rem; white-space: pre-wrap; }
  .nopad { padding: 0; }
  .scroll { overflow: auto; max-height: 65vh; }
  .scroll table { font-family: var(--mono); font-size: 0.8rem; }
  .scroll td { white-space: pre-wrap; word-break: break-word; max-width: 560px; }
  .nullcell { color: var(--muted); }
</style>
