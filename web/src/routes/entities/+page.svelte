<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { num, ago } from '$lib/format.js';

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

  function sortBy(col) {
    const dir = data.sort === col && data.dir === 'desc' ? 'asc' : 'desc';
    goto(build({ sort: col, dir, offset: null }));
  }

  function entLink(text) {
    const p = data.project ? `?project=${encodeURIComponent(data.project)}` : '';
    return `/entities/${encodeURIComponent(text)}${p}`;
  }

  function arrow(col) {
    if (data.sort !== col) return '';
    return data.dir === 'desc' ? ' ▼' : ' ▲';
  }
</script>

<h1>Entities</h1>

<form class="bar" onsubmit={submitSearch}>
  <input type="search" placeholder="search expression text…" bind:value={q} />
  <button type="submit">Search</button>
  {#if data.search}<a class="small muted" href={build({ q: null, offset: null })}>clear</a>{/if}
  <span class="spacer"></span>
  <span class="muted small">
    {#if data.total}{num(from)}–{num(to)} of {/if}{num(data.total)}{data.search ? ` matching “${data.search}”` : ''}
    {#if data.project} · scope {data.project}{/if}
  </span>
</form>

<div class="panel nopad">
  <table>
    <thead>
      <tr>
        <th><button class="sortbtn" onclick={() => sortBy('name')}>entity{arrow('name')}</button></th>
        <th>latest meaning</th>
        <th class="num"><button class="sortbtn" onclick={() => sortBy('thoughts')}>×{arrow('thoughts')}</button></th>
        <th class="nowrap"><button class="sortbtn" onclick={() => sortBy('last')}>last{arrow('last')}</button></th>
      </tr>
    </thead>
    <tbody>
      {#each data.rows as e}
        <tr>
          <td class="ent"><a href={entLink(e.expression)}>{e.expression}</a></td>
          <td class="muted small clip">{e.meaning ?? ''}</td>
          <td class="num">{num(e.thought_count)}</td>
          <td class="nowrap muted small" title={e.last_seen}>{ago(e.last_seen)}</td>
        </tr>
      {:else}
        <tr><td colspan="4" class="muted" style="padding:18px">No matching entities.</td></tr>
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
  .bar { display: flex; align-items: center; gap: 10px; margin: 10px 0 14px; }
  .bar input[type="search"] { width: 320px; }
  .spacer { flex: 1; }
  .nopad { padding: 0; overflow: hidden; }
  .ent { font-weight: 500; }
  .clip { max-width: 520px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .sortbtn { background: none; border: none; color: var(--muted); font: inherit; font-weight: 600; padding: 0; cursor: pointer; }
  .sortbtn:hover { color: var(--text); background: none; }
  .pager { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 16px 0; }
  .btnlike { padding: 5px 12px; border: 1px solid var(--border); border-radius: 6px; color: var(--text); }
  .btnlike:hover { background: var(--panel-2); text-decoration: none; }
  .btnlike.disabled { opacity: 0.35; pointer-events: none; }
</style>
