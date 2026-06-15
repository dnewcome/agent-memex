import { readdirSync, statSync, openSync, readSync, closeSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Claude Code stores one JSONL transcript per session under
// ~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl
const PROJECTS_DIR =
  process.env.CLAUDE_PROJECTS_DIR ?? join(homedir(), '.claude', 'projects');

const DISTILL_PREFIX = 'You are reading the transcript of a Claude Code session that just ended';

// Parsed-head cache keyed by `${path}:${mtimeMs}` so re-renders don't re-read files.
const metaCache = new Map();

/** Cheap stat-only enumeration of every transcript. */
function listFiles() {
  let projects;
  try {
    projects = readdirSync(PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    const dir = join(PROJECTS_DIR, p.name);
    let files;
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      let st;
      try {
        st = statSync(join(dir, f));
      } catch {
        continue;
      }
      out.push({
        id: f.slice(0, -'.jsonl'.length),
        project: p.name,
        path: join(dir, f),
        mtimeMs: st.mtimeMs,
        size: st.size
      });
    }
  }
  return out;
}

function readHead(path, bytes = 16384) {
  let fd;
  try {
    fd = openSync(path, 'r');
  } catch {
    return '';
  }
  try {
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    return buf.toString('utf8', 0, n);
  } catch {
    return '';
  } finally {
    closeSync(fd);
  }
}

/** Extract a session's display metadata from the head of its transcript. */
function parseMeta(file) {
  const key = `${file.path}:${file.mtimeMs}`;
  const hit = metaCache.get(key);
  if (hit) return hit;

  const head = readHead(file.path);
  let title = null;
  let firstUser = null;
  let startTs = null;
  let cwd = null;
  let isDistillation = false;

  for (const line of head.split('\n')) {
    if (!line.trim()) continue;
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      continue; // truncated tail line of the head window
    }
    if (!cwd && d.cwd) cwd = d.cwd;
    if (!startTs && d.timestamp) startTs = d.timestamp;
    if (!title && (d.aiTitle || (d.type === 'summary' && d.summary))) {
      title = d.aiTitle ?? d.summary;
    }
    if (!firstUser && d.type === 'user') {
      const c = d.message?.content;
      const text =
        typeof c === 'string'
          ? c
          : Array.isArray(c)
            ? c.map((x) => (typeof x === 'string' ? x : x?.text ?? '')).join(' ')
            : '';
      firstUser = text.slice(0, 200);
      if (text.startsWith(DISTILL_PREFIX)) isDistillation = true;
    }
  }

  const meta = { title, firstUser, startTs, cwd, isDistillation };
  metaCache.set(key, meta);
  return meta;
}

/** Decode the sanitized project-dir name into a readable hint (lossy). */
export function projectLabel(dir) {
  return dir.replace(/^-/, '/').replace(/-/g, '/');
}

/**
 * Paginated session list, newest activity first. Metadata (title/cwd/distillation
 * flag) is parsed only for the returned page. `search` matches session id or
 * project-dir name. `project` filters to one project dir.
 */
export function listSessions({ project = null, search = '', limit = 50, offset = 0 } = {}) {
  let files = listFiles();
  if (project) files = files.filter((f) => f.project === project);
  if (search) {
    const q = search.toLowerCase();
    files = files.filter((f) => f.id.toLowerCase().includes(q) || f.project.toLowerCase().includes(q));
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const total = files.length;
  const page = files.slice(offset, offset + limit).map((f) => ({
    id: f.id,
    project: f.project,
    sizeKb: Math.round(f.size / 1024),
    mtime: new Date(f.mtimeMs).toISOString(),
    ...parseMeta(f)
  }));

  return { sessions: page, total };
}

/** Per-project session counts (stat-only, cheap). */
export function projectCounts() {
  const counts = new Map();
  for (const f of listFiles()) counts.set(f.project, (counts.get(f.project) ?? 0) + 1);
  return [...counts.entries()].map(([project, n]) => ({ project, n })).sort((a, b) => b.n - a.n);
}

function clip(s, max) {
  const str = typeof s === 'string' ? s : String(s ?? '');
  if (str.length <= max) return { text: str, clipped: 0 };
  return { text: str.slice(0, max), clipped: str.length - max };
}

/** Flatten a tool_result's content (string, or array of text/image blocks) to text. */
function toolResultText(rc) {
  if (typeof rc === 'string') return rc;
  if (Array.isArray(rc)) {
    return rc
      .map((x) => (typeof x === 'string' ? x : x?.type === 'image' ? '[image]' : (x?.text ?? '')))
      .join('\n');
  }
  return '';
}

/**
 * Parse a transcript into an ordered list of renderable entries. Only user/
 * assistant message lines are kept; metadata lines (file-history-snapshot,
 * ai-title, mode, …) are skipped. Per-block text is capped at `maxChars` and
 * the whole list at `maxEntries` to keep large transcripts (the gasland runs
 * embed huge tool output) from producing enormous pages.
 */
export function readTranscript(id, { maxEntries = 1500, maxChars = 8000 } = {}) {
  const file = listFiles().find((f) => f.id === id);
  if (!file) return null;

  let raw;
  try {
    raw = readFileSync(file.path, 'utf8');
  } catch {
    return null;
  }

  const entries = [];
  let truncated = false;

  outer: for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    const t = d.type;
    if (t !== 'user' && t !== 'assistant') continue;
    const ts = d.timestamp ?? null;
    const content = d.message?.content;

    const push = (e) => {
      if (entries.length >= maxEntries) {
        truncated = true;
        return false;
      }
      entries.push(e);
      return true;
    };

    if (typeof content === 'string') {
      const c = clip(content, maxChars);
      if (!push({ role: t, kind: 'text', text: c.text, clipped: c.clipped, ts })) break;
    } else if (Array.isArray(content)) {
      for (const b of content) {
        if (!b || typeof b !== 'object') continue;
        let entry = null;
        if (b.type === 'text') {
          const c = clip(b.text, maxChars);
          entry = { role: t, kind: 'text', text: c.text, clipped: c.clipped, ts };
        } else if (b.type === 'thinking') {
          const c = clip(b.thinking ?? b.text ?? '', maxChars);
          entry = { role: t, kind: 'thinking', text: c.text, clipped: c.clipped, ts };
        } else if (b.type === 'tool_use') {
          const c = clip(JSON.stringify(b.input ?? {}, null, 2), maxChars);
          entry = { role: t, kind: 'tool_use', name: b.name ?? 'tool', text: c.text, clipped: c.clipped, ts };
        } else if (b.type === 'tool_result') {
          const c = clip(toolResultText(b.content), maxChars);
          entry = { role: 'tool', kind: 'tool_result', text: c.text, clipped: c.clipped, isError: !!b.is_error, ts };
        }
        if (entry && !push(entry)) break outer;
      }
    }
  }

  return { id, project: file.project, path: file.path, entries, truncated };
}

/** Locate one session's transcript across all project dirs and parse its metadata. */
export function sessionMeta(id) {
  const file = listFiles().find((f) => f.id === id);
  if (!file) return null;
  return {
    id: file.id,
    project: file.project,
    path: file.path,
    sizeKb: Math.round(file.size / 1024),
    mtime: new Date(file.mtimeMs).toISOString(),
    ...parseMeta(file)
  };
}
