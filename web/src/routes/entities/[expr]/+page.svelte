<script>
  import { num, datetime, date, ago } from '$lib/format.js';

  let { data } = $props();
  let d = $derived(data.detail);
  let projectQs = $derived(data.project ? `?project=${encodeURIComponent(data.project)}` : '');

  // Split outgoing edges: attribute-like (relation present, not in_project) vs in_project.
  let attrs = $derived(d.outgoing.filter((o) => o.relation && o.relation !== 'in_project'));
  let plainOut = $derived(d.outgoing.filter((o) => !o.relation));

  function entLink(text) {
    return `/entities/${encodeURIComponent(text)}${projectQs}`;
  }
</script>

<div class="crumbs small muted">
  <a href={`/entities${projectQs}`}>← entities</a>
</div>

<h1 class="title">{d.expression}</h1>
<div class="meta muted small">
  first seen {date(d.created_at)} · encountered {num(d.thoughts.length)}×
  {#if d.thoughts.length}· last {ago(d.thoughts[d.thoughts.length - 1].created_at)}{/if}
  {#each d.projects as p}<a class="tag" href={`/entities?project=${encodeURIComponent(p)}`}>{p}</a>{/each}
</div>

<div class="cols">
  <div class="main-col">
    <h2>Meanings ({num(d.meanings.length)})</h2>
    {#if d.meanings.length}
      <ol class="meanings">
        {#each [...d.meanings].reverse() as m}
          <li class="panel">
            <div>{m.text}</div>
            <div class="muted small stamp">
              {datetime(m.created_at)} · {m.observer}
              {#if m.session_id}· <a href={`/sessions/${m.session_id}`}>session</a>{/if}
            </div>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="muted small">No meanings recorded — encountered but never interpreted.</p>
    {/if}

    <h2>Thought log ({num(d.thoughts.length)})</h2>
    {#if d.thoughts.length}
      <div class="panel log">
        {#each [...d.thoughts].reverse() as t}
          <div class="logrow">
            <span class="mono small">{datetime(t.created_at)}</span>
            <span class="muted small">
              {#if t.session_id}<a href={`/sessions/${t.session_id}`}>session</a>{:else}{t.observer}{/if}
            </span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="muted small">No encounters logged.</p>
    {/if}
  </div>

  <aside class="side-col">
    {#if attrs.length}
      <h2>Attributes</h2>
      <div class="panel nopad">
        <table>
          <tbody>
            {#each attrs as a}
              <tr><td class="rel">{a.relation}</td><td><a href={entLink(a.target)}>{a.target}</a></td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    {#if plainOut.length}
      <h2>Connected to</h2>
      <div class="panel nopad">
        <table><tbody>
          {#each plainOut as o}<tr><td><a href={entLink(o.target)}>{o.target}</a></td></tr>{/each}
        </tbody></table>
      </div>
    {/if}

    {#if d.incoming.length}
      <h2>Referenced by ({num(d.incoming.length)})</h2>
      <div class="panel nopad">
        <table><tbody>
          {#each d.incoming as c}
            <tr>
              <td><a href={entLink(c.source)}>{c.source}</a></td>
              <td class="rel">{c.relation ?? '→'}</td>
            </tr>
          {/each}
        </tbody></table>
      </div>
    {/if}

    {#if !attrs.length && !plainOut.length && !d.incoming.length}
      <h2>Connections</h2>
      <p class="muted small">No connections — this is an orphan expression.</p>
    {/if}
  </aside>
</div>

<style>
  .crumbs { margin-bottom: 8px; }
  .title { font-family: var(--mono); font-size: 1.25rem; word-break: break-word; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 6px; }
  .cols { display: grid; grid-template-columns: 1.6fr 1fr; gap: 24px; align-items: start; }
  .meanings { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .meanings li { padding: 10px 12px; }
  .stamp { margin-top: 6px; }
  .log { max-height: 320px; overflow: auto; display: flex; flex-direction: column; gap: 2px; }
  .logrow { display: flex; justify-content: space-between; gap: 12px; padding: 1px 0; }
  .nopad { padding: 0; overflow: hidden; }
  .side-col table td { padding: 5px 10px; }
  @media (max-width: 880px) { .cols { grid-template-columns: 1fr; } }
</style>
