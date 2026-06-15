<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { num, ago, date } from '$lib/format.js';

  let { data } = $props();
  let q = $state(data.search);
  let from = $state(data.from ?? '');
  let to = $state(data.to ?? '');
  $effect(() => { q = data.search; from = data.from ?? ''; to = data.to ?? ''; });

  let rangeActive = $derived(Boolean(data.from || data.to));

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
    goto(build({ q }), { keepFocus: true });
  }

  function applyRange(e) {
    e.preventDefault();
    goto(build({ from: from || null, to: to || null }), { keepFocus: true });
  }

  function entLink(text) {
    const p = data.project ? `?project=${encodeURIComponent(data.project)}` : '';
    return `/entities/${encodeURIComponent(text)}${p}`;
  }

  // The relation list always reflects the active range/scope. When a range is set
  // it is exactly "relations created in that window"; otherwise it's the full vocab.
  let relations = $derived(data.vocab.rows);

  function rangeLabel() {
    if (data.from && data.to) return `${data.from} → ${data.to}`;
    if (data.from) return `since ${data.from}`;
    if (data.to) return `through ${data.to}`;
    return 'all time';
  }

  function downloadCsv() {
    const header = 'relation,count,last_created\n';
    const body = relations
      .map((r) => `${csv(r.relation)},${r.n},${csv((r.last_at ?? '').slice(0, 19))}`)
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `relations_${data.from || 'start'}_${data.to || 'end'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function csv(s) {
    const v = String(s ?? '');
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }
</script>

<h1>Connections</h1>

<form class="range" onsubmit={applyRange}>
  <span class="muted small">created between</span>
  <input type="date" bind:value={from} />
  <span class="muted small">and</span>
  <input type="date" bind:value={to} />
  <button type="submit">Apply</button>
  {#if rangeActive}<a class="small muted" href={build({ from: null, to: null })}>clear range</a>{/if}
</form>

<div class="layout">
  <aside>
    <div class="vochead">
      <h3>relations · {rangeLabel()}</h3>
      <button class="ghost tiny" onclick={downloadCsv} title="Download this list as CSV">CSV</button>
    </div>
    <p class="muted small vstats">
      {num(data.vocab.distinct)} distinct over {num(data.vocab.total)} connections ·
      <span class="warn-text">{num(data.vocab.oneOffs)}</span> used once
      {#if data.vocab.distinct}({Math.round((data.vocab.oneOffs / data.vocab.distinct) * 100)}%){/if}
    </p>
    <div class="panel nopad rellist">
      <table>
        <thead><tr><th>relation</th><th class="num">×</th></tr></thead>
        <tbody>
          <tr class:on={!data.relation}>
            <td><a href={build({ relation: null })}>all relations</a></td>
            <td class="num">{num(data.vocab.total)}</td>
          </tr>
          {#each relations as r}
            <tr class:on={data.relation === r.relation}>
              <td><a class="rel" href={build({ relation: r.relation })}>{r.relation}</a></td>
              <td class="num">{num(r.n)}</td>
            </tr>
          {:else}
            <tr><td colspan="2" class="muted" style="padding:14px">No relations in range.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </aside>

  <div class="main-col">
    <form class="bar" onsubmit={submitSearch}>
      <input type="search" placeholder="filter by endpoint text…" bind:value={q} />
      <button type="submit">Filter</button>
      {#if data.relation}<span class="tag">relation: <span class="rel">{data.relation}</span></span>{/if}
      {#if data.project}<span class="tag">scope: {data.project}</span>{/if}
      <span class="spacer"></span>
      <span class="muted small">{num(data.rows.length)} edges{data.rows.length >= 300 ? ' (capped)' : ''}</span>
    </form>

    <div class="panel nopad">
      <table>
        <thead><tr><th>from</th><th>relation</th><th>to</th><th class="num">×</th><th class="nowrap">last</th></tr></thead>
        <tbody>
          {#each data.rows as c}
            <tr>
              <td><a href={entLink(c.from_expression)}>{c.from_expression}</a></td>
              <td class="rel">{c.relation ?? '→'}</td>
              <td><a href={entLink(c.to_expression)}>{c.to_expression}</a></td>
              <td class="num">{num(c.n)}</td>
              <td class="nowrap muted small" title={c.last_at}>{ago(c.last_at)}</td>
            </tr>
          {:else}
            <tr><td colspan="5" class="muted" style="padding:18px">No connections match.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  .range { display: flex; align-items: center; gap: 8px; margin: 8px 0 16px; flex-wrap: wrap; }
  .layout { display: grid; grid-template-columns: 300px 1fr; gap: 22px; align-items: start; }
  .vochead { display: flex; align-items: center; justify-content: space-between; }
  .vstats { margin: 2px 0 8px; }
  .warn-text { color: var(--warn); }
  .rellist { max-height: 64vh; overflow: auto; }
  .rellist tr.on { background: var(--panel-2); }
  .rellist td { padding: 4px 10px; }
  .tiny { padding: 2px 8px; font-size: 0.72rem; }
  .bar { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; }
  .bar input[type="search"] { width: 280px; }
  .spacer { flex: 1; }
  .nopad { padding: 0; overflow: hidden; }
  @media (max-width: 880px) { .layout { grid-template-columns: 1fr; } }
</style>
