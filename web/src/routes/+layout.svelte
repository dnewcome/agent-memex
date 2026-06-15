<script>
  import '../app.css';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { num } from '$lib/format.js';

  let { data, children } = $props();

  const links = [
    { href: '/', label: 'Overview' },
    { href: '/entities', label: 'Entities' },
    { href: '/connections', label: 'Connections' },
    { href: '/sessions', label: 'Sessions' },
    { href: '/query', label: 'Query' }
  ];

  let path = $derived($page.url.pathname);
  let project = $derived($page.url.searchParams.get('project') ?? '');

  function isActive(href) {
    return href === '/' ? path === '/' : path.startsWith(href);
  }

  // Changing the project selector preserves the current page but resets pagination.
  function onProject(e) {
    const v = e.currentTarget.value;
    const u = new URL($page.url);
    if (v) u.searchParams.set('project', v);
    else u.searchParams.delete('project');
    u.searchParams.delete('offset');
    goto(u.pathname + u.search, { keepFocus: true });
  }
</script>

<div class="shell">
  <header>
    <div class="brand">
      <span class="logo">◇</span>
      <span class="title">Pansophia</span>
      <span class="sub muted small">memory explorer</span>
    </div>

    <nav>
      {#each links as l}
        <a href={project ? `${l.href}?project=${encodeURIComponent(project)}` : l.href}
           class:active={isActive(l.href)}>{l.label}</a>
      {/each}
    </nav>

    <div class="ctx">
      <label class="small muted" for="proj">scope</label>
      <select id="proj" value={project} onchange={onProject}>
        <option value="">all (global)</option>
        {#each data.projects as p}
          <option value={p.project}>{p.project} ({num(p.entities)})</option>
        {/each}
      </select>
    </div>
  </header>

  <main>
    {@render children()}
  </main>

  <footer class="muted small">
    {num(data.counts.expression)} expressions · {num(data.counts.thought)} thoughts ·
    {num(data.counts.meaning)} meanings · {num(data.counts.connection)} connections ·
    observer{data.observers.length === 1 ? '' : 's'}: {data.observers.map((o) => o.name).join(', ') || '—'} ·
    <span class="tag">read-only</span>
  </footer>
</div>

<style>
  .shell { max-width: 1180px; margin: 0 auto; padding: 0 18px 40px; }
  header {
    display: flex; align-items: center; gap: 22px;
    padding: 14px 0; border-bottom: 1px solid var(--border);
    position: sticky; top: 0; background: var(--bg); z-index: 5;
  }
  .brand { display: flex; align-items: baseline; gap: 8px; }
  .logo { color: var(--accent); font-size: 1.1rem; }
  .title { font-weight: 700; letter-spacing: 0.2px; }
  nav { display: flex; gap: 4px; flex: 1; }
  nav a {
    padding: 5px 12px; border-radius: 6px; color: var(--muted); font-size: 0.9rem;
  }
  nav a:hover { background: var(--panel-2); color: var(--text); text-decoration: none; }
  nav a.active { background: var(--panel); color: var(--text); border: 1px solid var(--border); }
  .ctx { display: flex; align-items: center; gap: 7px; }
  main { padding-top: 18px; }
  footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid var(--border); }
</style>
