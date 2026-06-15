<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { num, datetime, ago } from '$lib/format.js';

  let { data } = $props();
  let q = $state(data.search);
  $effect(() => { q = data.search; });

  let from = $derived(data.total === 0 ? 0 : data.offset + 1);
  let to = $derived(Math.min(data.offset + data.pageSize, data.total));
  let hasPrev = $derived(data.offset > 0);
  let hasNext = $derived(data.offset + data.pageSize < data.total);

  function build(params) {
    const u = new URL($page.url);
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === '' || v === undefined) u.searchParams.delete(k);
      else u.searchParams.set(k, v);
    }
    return u.pathname + u.search;
  }

  function submitSearch(e) {
    e.preventDefault();
    goto(build({ q, offset: null }), { keepFocus: true });
  }
</script>

<h1>Sessions</h1>
<p class="muted small">
  Claude Code transcripts from <code>~/.claude/projects</code>. Memory counts show what each session
  contributed to pansophia (populated for sessions captured after provenance tracking was enabled).
</p>

<form class="bar" onsubmit={submitSearch}>
  <input type="search" placeholder="search session id or project…" bind:value={q} />
  <button type="submit">Search</button>
  <select value={data.project ?? ''} onchange={(e) => goto(build({ project: e.currentTarget.value || null, offset: null }))}>
    <option value="">all projects ({num(data.total)})</option>
    {#each data.projects as p}<option value={p.project}>{p.project} ({num(p.n)})</option>{/each}
  </select>
  <label class="small muted chk">
    <input type="checkbox" checked={data.hideDistill}
           onchange={(e) => goto(build({ hideDistill: e.currentTarget.checked ? '1' : null, offset: null }))} />
    hide distillation runs
  </label>
  <span class="spacer"></span>
  <span class="muted small">{num(from)}–{num(to)} of {num(data.total)}</span>
</form>

<div class="panel nopad">
  <table>
    <thead>
      <tr><th>session</th><th>project</th><th class="nowrap">last activity</th><th class="num">mem</th><th class="num nowrap">size</th></tr>
    </thead>
    <tbody>
      {#each data.sessions as s}
        <tr>
          <td>
            <a href={`/sessions/${s.id}`}>{s.title ?? s.id.slice(0, 8)}</a>
            {#if s.isDistillation}<span class="tag distill">distill</span>{/if}
            {#if s.firstUser}<div class="muted small clip">{s.firstUser}</div>{/if}
          </td>
          <td class="muted small mono clip2">{s.project}</td>
          <td class="nowrap muted small" title={s.mtime}>{ago(s.mtime)}</td>
          <td class="num">
            {#if s.memory && (s.memory.thoughts || s.memory.connections)}
              <span class="memcount" title={`${s.memory.thoughts} thoughts, ${s.memory.connections} connections`}>{num(s.memory.thoughts + s.memory.connections)}</span>
            {:else}<span class="muted">—</span>{/if}
          </td>
          <td class="num nowrap muted small">{num(s.sizeKb)}k</td>
        </tr>
      {:else}
        <tr><td colspan="5" class="muted" style="padding:18px">No sessions found.</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<div class="pager">
  <a class="btnlike" class:disabled={!hasPrev}
     href={hasPrev ? build({ offset: Math.max(0, data.offset - data.pageSize) || null }) : undefined}>← prev</a>
  <span class="muted small">page {Math.floor(data.offset / data.pageSize) + 1} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
  <a class="btnlike" class:disabled={!hasNext}
     href={hasNext ? build({ offset: data.offset + data.pageSize }) : undefined}>next →</a>
</div>

<style>
  .bar { display: flex; align-items: center; gap: 10px; margin: 10px 0 14px; flex-wrap: wrap; }
  .bar input[type="search"] { width: 260px; }
  .chk { display: flex; align-items: center; gap: 5px; }
  .spacer { flex: 1; }
  .nopad { padding: 0; overflow: hidden; }
  .clip { max-width: 560px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .clip2 { max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .distill { color: var(--warn); border-color: var(--warn); }
  .memcount { color: var(--good); font-variant-numeric: tabular-nums; }
  .pager { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 16px 0; }
  .btnlike { padding: 5px 12px; border: 1px solid var(--border); border-radius: 6px; color: var(--text); }
  .btnlike:hover { background: var(--panel-2); text-decoration: none; }
  .btnlike.disabled { opacity: 0.35; pointer-events: none; }
</style>
