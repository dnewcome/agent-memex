<script>
  import { num, datetime, date } from '$lib/format.js';

  let { data } = $props();
  let m = $derived(data.meta);
  let mem = $derived(data.memories);
  let hasMemories = $derived(mem.thoughts.length > 0 || mem.connections.length > 0);
</script>

<div class="crumbs small muted"><a href="/sessions">← sessions</a></div>

<h1 class="title">{m?.title ?? data.id.slice(0, 12)}</h1>
<div class="meta muted small">
  <span class="mono">{data.id}</span>
  {#if m?.isDistillation}<span class="tag distill">distillation run</span>{/if}
  {#if m}<a class="readlink" href={`/sessions/${data.id}/transcript`}>read transcript →</a>{/if}
</div>

{#if m}
  <div class="panel kv">
    <div><span class="k">project</span><span class="mono">{m.project}</span></div>
    {#if m.cwd}<div><span class="k">cwd</span><span class="mono">{m.cwd}</span></div>{/if}
    {#if m.startTs}<div><span class="k">started</span>{datetime(m.startTs)}</div>{/if}
    <div><span class="k">last activity</span>{datetime(m.mtime)}</div>
    <div><span class="k">transcript</span><span class="mono small">{m.path}</span> · {num(m.sizeKb)}k</div>
    {#if m.firstUser}<div><span class="k">opened with</span><span class="clip">{m.firstUser}</span></div>{/if}
  </div>
{:else}
  <p class="muted small">Transcript file not found on disk (it may have been pruned). Showing the memories this session produced.</p>
{/if}

<h2>Memories produced</h2>
{#if !hasMemories}
  <p class="muted small">
    This session produced no pansophia memories
    {#if m && !m.isDistillation}— either it predates provenance tracking, or nothing was distilled from it.{/if}
  </p>
{:else}
  {#if mem.thoughts.length}
    <div class="panel nopad">
      <table>
        <thead><tr><th>entity</th><th>meaning</th><th class="nowrap">when</th></tr></thead>
        <tbody>
          {#each mem.thoughts as t}
            <tr>
              <td><a href={`/entities/${encodeURIComponent(t.expression)}`}>{t.expression}</a></td>
              <td class="muted small clip">{t.meaning ?? ''}</td>
              <td class="nowrap muted small">{datetime(t.created_at)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if mem.connections.length}
    <h3 style="margin-top:14px">connections</h3>
    <div class="panel nopad">
      <table>
        <tbody>
          {#each mem.connections as c}
            <tr>
              <td><a href={`/entities/${encodeURIComponent(c.from_expression)}`}>{c.from_expression}</a></td>
              <td class="rel">{c.relation ?? '→'}</td>
              <td><a href={`/entities/${encodeURIComponent(c.to_expression)}`}>{c.to_expression}</a></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

<style>
  .crumbs { margin-bottom: 8px; }
  .title { font-size: 1.25rem; word-break: break-word; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 10px; }
  .distill { color: var(--warn); border-color: var(--warn); }
  .kv { display: flex; flex-direction: column; gap: 6px; }
  .kv > div { display: flex; gap: 12px; align-items: baseline; }
  .kv .k { color: var(--muted); width: 110px; flex-shrink: 0; font-size: 0.8rem; }
  .nopad { padding: 0; overflow: hidden; }
  .clip { max-width: 620px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
</style>
