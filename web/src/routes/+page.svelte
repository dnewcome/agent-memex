<script>
  import { num, date, ago } from '$lib/format.js';

  let { data } = $props();

  let counts = $derived(data.activity.daily);
  let maxDay = $derived(Math.max(1, ...counts.map((d) => d.n)));
  let projectQs = $derived(data.project ? `?project=${encodeURIComponent(data.project)}` : '');

  function entLink(text) {
    return `/entities/${encodeURIComponent(text)}${projectQs}`;
  }
</script>

<h1>Overview</h1>
<p class="muted small">
  {#if data.project}Scoped to <strong>{data.project}</strong> (plus untagged globals).{:else}Global view across all projects.{/if}
</p>

<section class="grid">
  <div class="panel stat">
    <div class="big">{num(data.activity.windows.last1 ?? 0)}</div>
    <div class="muted small">thoughts today</div>
  </div>
  <div class="panel stat">
    <div class="big">{num(data.activity.windows.last7 ?? 0)}</div>
    <div class="muted small">last 7 days</div>
  </div>
  <div class="panel stat">
    <div class="big">{num(data.activity.windows.last30 ?? 0)}</div>
    <div class="muted small">last 30 days</div>
  </div>
  <div class="panel stat">
    <div class="big">{num(data.relations.distinct)}</div>
    <div class="muted small">distinct relations</div>
  </div>
</section>

<h2>Activity</h2>
<div class="panel">
  <div class="chart" aria-label="thoughts per day">
    {#each counts as d}
      <a class="bar" style="height: {Math.max(2, (d.n / maxDay) * 100)}%"
         href={`/connections?from=${d.day}&to=${d.day}${data.project ? `&project=${encodeURIComponent(data.project)}` : ''}`}
         title={`${d.day}: ${d.n} thoughts — click for relations created that day`}></a>
    {/each}
  </div>
  <div class="chart-axis muted small">
    <span>{counts[0]?.day ?? ''}</span>
    <span>thoughts/day · peak {maxDay}</span>
    <span>{counts[counts.length - 1]?.day ?? ''}</span>
  </div>
</div>

<div class="cols">
  <div>
    <h2>Most active entities</h2>
    <div class="panel nopad">
      <table>
        <thead><tr><th>entity</th><th class="num">×</th><th class="nowrap">last</th></tr></thead>
        <tbody>
          {#each data.topEntities as e}
            <tr>
              <td>
                <a href={entLink(e.expression)}>{e.expression}</a>
                {#if e.meaning}<div class="muted small clip">{e.meaning}</div>{/if}
              </td>
              <td class="num">{num(e.thought_count)}</td>
              <td class="nowrap muted small" title={e.last_seen}>{ago(e.last_seen)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <div>
    <h2>Relation vocabulary</h2>
    <div class="panel">
      <p class="small muted" style="margin-top:0">
        {num(data.relations.distinct)} distinct labels across {num(data.relations.rows.reduce((a, r) => a + r.n, 0))}
        connections — <strong class="warn-text">{num(data.relations.oneOffs)}</strong> used only once
        ({Math.round((data.relations.oneOffs / Math.max(1, data.relations.distinct)) * 100)}% sprawl).
      </p>
    </div>
    <div class="panel nopad" style="margin-top:10px">
      <table>
        <thead><tr><th>relation</th><th class="num">count</th></tr></thead>
        <tbody>
          {#each data.relations.rows.slice(0, 15) as r}
            <tr>
              <td><a class="rel" href={`/connections${projectQs ? projectQs + '&' : '?'}relation=${encodeURIComponent(r.relation)}`}>{r.relation}</a></td>
              <td class="num">{num(r.n)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <h2>Data quality</h2>
    <div class="panel dq">
      <div><span class="big">{num(data.quality.noMeaning)}</span><span class="muted small">expressions with no meaning</span></div>
      <div><span class="big">{num(data.quality.orphans)}</span><span class="muted small">orphans (no connections)</span></div>
      <div><span class="big">{num(data.quality.noThought)}</span><span class="muted small">never encountered</span></div>
    </div>
  </div>
</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 14px 0; }
  .stat .big { font-size: 1.8rem; font-weight: 700; line-height: 1.1; }
  .big { font-size: 1.5rem; font-weight: 700; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items: start; }
  .nopad { padding: 0; overflow: hidden; }
  .clip { overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .warn-text { color: var(--warn); }
  .dq { display: flex; flex-direction: column; gap: 10px; }
  .dq > div { display: flex; align-items: baseline; gap: 10px; }
  .chart { display: flex; align-items: flex-end; gap: 1px; height: 110px; }
  .chart .bar { flex: 1; background: var(--accent-dim); border-radius: 1px 1px 0 0; min-width: 1px; }
  .chart .bar:hover { background: var(--accent); }
  .chart-axis { display: flex; justify-content: space-between; margin-top: 6px; }
  @media (max-width: 880px) {
    .grid { grid-template-columns: repeat(2, 1fr); }
    .cols { grid-template-columns: 1fr; }
  }
</style>
