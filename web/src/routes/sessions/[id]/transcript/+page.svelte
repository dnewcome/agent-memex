<script>
  import { num, datetime } from '$lib/format.js';

  let { data } = $props();
  let tx = $derived(data.transcript);
  let m = $derived(data.meta);

  const ROLE = {
    text: (e) => (e.role === 'user' ? 'user' : 'assistant'),
    thinking: () => 'thinking',
    tool_use: () => 'tool call',
    tool_result: () => 'tool result'
  };

  // Collapse the noisy block kinds by default; keep prose expanded.
  function collapsed(kind) {
    return kind === 'thinking' || kind === 'tool_use' || kind === 'tool_result';
  }
</script>

<div class="crumbs small muted">
  <a href="/sessions">sessions</a> / <a href={`/sessions/${data.id}`}>{m?.title ?? data.id.slice(0, 8)}</a> / transcript
</div>

<h1 class="title">{m?.title ?? 'Transcript'}</h1>
<div class="meta muted small">
  <span class="mono">{data.id}</span>
  · {num(tx.entries.length)} blocks
  {#if tx.truncated}<span class="tag warn-tag">truncated</span>{/if}
</div>
{#if tx.truncated}
  <p class="muted small">Showing the first {num(tx.entries.length)} blocks. Full transcript on disk: <span class="mono">{tx.path}</span></p>
{/if}

<div class="feed">
  {#each tx.entries as e}
    <div class="entry {e.role} {e.kind}" class:err={e.isError}>
      <div class="gutter">
        <span class="role">{ROLE[e.kind]?.(e) ?? e.kind}</span>
        {#if e.name}<span class="tname mono">{e.name}</span>{/if}
        {#if e.ts}<span class="ts muted">{datetime(e.ts)}</span>{/if}
      </div>
      {#if collapsed(e.kind)}
        <details>
          <summary class="muted small">{e.kind === 'thinking' ? 'thinking' : e.kind === 'tool_use' ? `input` : 'output'} · {num(e.text.length)} chars{e.clipped ? `, +${num(e.clipped)} clipped` : ''}</summary>
          <pre class="body">{e.text}{#if e.clipped}

… {num(e.clipped)} more characters clipped …{/if}</pre>
        </details>
      {:else}
        <div class="body prose">{e.text}{#if e.clipped}<span class="muted"> … {num(e.clipped)} more characters clipped …</span>{/if}</div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .crumbs { margin-bottom: 8px; }
  .title { font-size: 1.25rem; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
  .warn-tag { color: var(--warn); border-color: var(--warn); }
  .feed { display: flex; flex-direction: column; gap: 8px; }
  .entry { border-left: 3px solid var(--border); padding: 4px 0 4px 12px; }
  .entry.user { border-left-color: var(--accent); }
  .entry.assistant.text { border-left-color: var(--accent-dim); }
  .entry.thinking { border-left-color: #6b5b8a; }
  .entry.tool_use { border-left-color: var(--warn); }
  .entry.tool_result { border-left-color: #3a5a4a; }
  .entry.err { border-left-color: var(--bad); }
  .gutter { display: flex; align-items: baseline; gap: 10px; margin-bottom: 3px; }
  .role { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; }
  .tname { font-size: 0.78rem; color: var(--warn); }
  .ts { font-size: 0.72rem; }
  .body { margin: 0; }
  .prose { white-space: pre-wrap; word-break: break-word; }
  pre.body { white-space: pre-wrap; word-break: break-word; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-family: var(--mono); font-size: 0.78rem; margin-top: 5px; max-height: 480px; overflow: auto; }
  summary { cursor: pointer; }
  details { margin-top: 2px; }
</style>
