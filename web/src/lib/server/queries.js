import db from './db.js';

/**
 * Inclusive project-scoping clause, mirroring src/model.js:96-139.
 * An expression is in scope if it has NO `in_project` tag at all (a global /
 * cross-project memory) OR is tagged `in_project` for the selected project.
 * `col` is the SQL expression yielding the expression id to test.
 * Returns { clause, params } — params are positional (`?`) in order.
 */
function projectScope(col, project) {
  if (!project) return { clause: '', params: [] };
  const clause = `
    AND (
      NOT EXISTS (
        SELECT 1 FROM connection cp
        WHERE cp.from_expression_id = ${col}
          AND cp.relation = 'in_project'
      )
      OR EXISTS (
        SELECT 1 FROM connection cp
        JOIN expression pe ON pe.id = cp.to_expression_id
        WHERE cp.from_expression_id = ${col}
          AND cp.relation = 'in_project'
          AND pe.text = ?
      )
    )`;
  return { clause, params: [project] };
}

// --- Overview ---

export function stats() {
  const counts = {};
  for (const t of ['observer', 'expression', 'thought', 'meaning', 'connection']) {
    counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  }

  const observers = db
    .prepare(
      `SELECT o.name, o.created_at,
        (SELECT COUNT(*) FROM thought t    WHERE t.observer_id = o.id) AS thoughts,
        (SELECT COUNT(*) FROM meaning m    WHERE m.observer_id = o.id) AS meanings,
        (SELECT COUNT(*) FROM connection c WHERE c.observer_id = o.id) AS connections
       FROM observer o
       ORDER BY o.id`
    )
    .all();

  const projects = db
    .prepare(
      `SELECT pe.text AS project, COUNT(DISTINCT c.from_expression_id) AS entities
       FROM connection c
       JOIN expression pe ON pe.id = c.to_expression_id
       WHERE c.relation = 'in_project'
       GROUP BY pe.text
       ORDER BY entities DESC`
    )
    .all();

  return { counts, observers, projects };
}

/** Thoughts-per-day for the most recent `days` distinct days, plus rolling windows. */
export function activity(days = 120) {
  const daily = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n
       FROM thought
       GROUP BY day
       ORDER BY day DESC
       LIMIT ?`
    )
    .all(days)
    .reverse();

  const windows = db
    .prepare(
      `SELECT
        SUM(created_at >= datetime('now', '-1 day'))   AS last1,
        SUM(created_at >= datetime('now', '-7 days'))  AS last7,
        SUM(created_at >= datetime('now', '-30 days')) AS last30
       FROM thought`
    )
    .get();

  return { daily, windows };
}

export function topEntities(limit = 15, project = null) {
  const scope = projectScope('e.id', project);
  return db
    .prepare(
      `SELECT e.text AS expression,
        COUNT(t.id) AS thought_count,
        MAX(t.created_at) AS last_seen,
        (SELECT m.text FROM meaning m WHERE m.expression_id = e.id ORDER BY m.created_at DESC LIMIT 1) AS meaning
       FROM expression e
       JOIN thought t ON t.expression_id = e.id
       WHERE 1=1 ${scope.clause}
       GROUP BY e.id
       ORDER BY thought_count DESC, last_seen DESC
       LIMIT ?`
    )
    .all(...scope.params, limit);
}

/**
 * Relation-vocabulary breakdown — surfaces the one-off sprawl as a data-quality
 * signal. Optional filters narrow to connections *created* within a date range
 * (inclusive 'YYYY-MM-DD' bounds) and/or a project scope on the `from` side.
 */
export function relationVocab({ from = null, to = null, project = null } = {}) {
  const where = [];
  const params = [];
  if (from) {
    where.push(`substr(c.created_at, 1, 10) >= ?`);
    params.push(from);
  }
  if (to) {
    where.push(`substr(c.created_at, 1, 10) <= ?`);
    params.push(to);
  }
  const scope = projectScope('c.from_expression_id', project);
  if (scope.clause) {
    where.push(scope.clause.replace(/^\s*AND\s*/, ''));
    params.push(...scope.params);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT COALESCE(NULLIF(c.relation, ''), '(none)') AS relation,
        COUNT(*) AS n, MAX(c.created_at) AS last_at
       FROM connection c
       ${whereSql}
       GROUP BY c.relation
       ORDER BY n DESC, relation ASC`
    )
    .all(...params);
  const oneOffs = rows.filter((r) => r.n === 1).length;
  const total = rows.reduce((a, r) => a + r.n, 0);
  return { rows, distinct: rows.length, oneOffs, total };
}

export function dataQuality() {
  const noMeaning = db
    .prepare(
      `SELECT COUNT(*) AS n FROM expression e
       WHERE NOT EXISTS (SELECT 1 FROM meaning m WHERE m.expression_id = e.id)`
    )
    .get().n;
  const orphans = db
    .prepare(
      `SELECT COUNT(*) AS n FROM expression e
       WHERE NOT EXISTS (SELECT 1 FROM connection c WHERE c.from_expression_id = e.id OR c.to_expression_id = e.id)`
    )
    .get().n;
  const noThought = db
    .prepare(
      `SELECT COUNT(*) AS n FROM expression e
       WHERE NOT EXISTS (SELECT 1 FROM thought t WHERE t.expression_id = e.id)`
    )
    .get().n;
  return { noMeaning, orphans, noThought };
}

// --- Entity browser ---

const SORT_COLUMNS = {
  thoughts: 'thought_count',
  last: 'last_seen',
  name: 'e.text'
};

export function browseEntities({
  search = '',
  project = null,
  sort = 'thoughts',
  dir = 'desc',
  limit = 50,
  offset = 0
} = {}) {
  const where = [];
  const params = [];
  if (search) {
    where.push(`e.text LIKE ?`);
    params.push(`%${search}%`);
  }
  const scope = projectScope('e.id', project);
  if (scope.clause) {
    // scope.clause begins with "AND ..."; strip the leading AND for a WHERE list
    where.push(scope.clause.replace(/^\s*AND\s*/, ''));
    params.push(...scope.params);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sortCol = SORT_COLUMNS[sort] ?? SORT_COLUMNS.thoughts;
  const dirSql = dir === 'asc' ? 'ASC' : 'DESC';

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM expression e ${whereSql}`)
    .get(...params).n;

  const rows = db
    .prepare(
      `SELECT e.text AS expression,
        COUNT(t.id) AS thought_count,
        MAX(t.created_at) AS last_seen,
        (SELECT m.text FROM meaning m WHERE m.expression_id = e.id ORDER BY m.created_at DESC LIMIT 1) AS meaning
       FROM expression e
       LEFT JOIN thought t ON t.expression_id = e.id
       ${whereSql}
       GROUP BY e.id
       ORDER BY ${sortCol} ${dirSql}, e.text ASC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return { rows, total };
}

/** Full context for one expression — the "reflect" view (ports src/model.js:349-369 + incoming). */
export function entityDetail(text) {
  const e = db.prepare(`SELECT * FROM expression WHERE text = ?`).get(text);
  if (!e) return null;

  const thoughts = db
    .prepare(
      `SELECT t.created_at, t.session_id, o.name AS observer
       FROM thought t JOIN observer o ON o.id = t.observer_id
       WHERE t.expression_id = ?
       ORDER BY t.created_at ASC`
    )
    .all(e.id);

  const meanings = db
    .prepare(
      `SELECT m.text, m.created_at, m.session_id, o.name AS observer
       FROM meaning m JOIN observer o ON o.id = m.observer_id
       WHERE m.expression_id = ?
       ORDER BY m.created_at ASC`
    )
    .all(e.id);

  const outgoing = db
    .prepare(
      `SELECT et.text AS target, c.relation, c.created_at
       FROM connection c JOIN expression et ON et.id = c.to_expression_id
       WHERE c.from_expression_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(e.id);

  const incoming = db
    .prepare(
      `SELECT ef.text AS source, c.relation, c.created_at
       FROM connection c JOIN expression ef ON ef.id = c.from_expression_id
       WHERE c.to_expression_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(e.id);

  const projects = outgoing.filter((o) => o.relation === 'in_project').map((o) => o.target);

  return { expression: text, created_at: e.created_at, thoughts, meanings, outgoing, incoming, projects };
}

// --- Connections / relations ---

export function connectionsAggregated({
  relation = null,
  project = null,
  search = '',
  from = null,
  to = null,
  limit = 300
} = {}) {
  const where = [];
  const params = [];
  if (relation) {
    where.push(`c.relation = ?`);
    params.push(relation);
  }
  if (from) {
    where.push(`substr(c.created_at, 1, 10) >= ?`);
    params.push(from);
  }
  if (to) {
    where.push(`substr(c.created_at, 1, 10) <= ?`);
    params.push(to);
  }
  if (search) {
    where.push(`(ef.text LIKE ? OR et.text LIKE ?)`);
    params.push(`%${search}%`, `%${search}%`);
  }
  const scope = projectScope('c.from_expression_id', project);
  if (scope.clause) {
    where.push(scope.clause.replace(/^\s*AND\s*/, ''));
    params.push(...scope.params);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  return db
    .prepare(
      `SELECT ef.text AS from_expression, et.text AS to_expression, c.relation,
        COUNT(c.id) AS n, MAX(c.created_at) AS last_at
       FROM connection c
       JOIN expression ef ON ef.id = c.from_expression_id
       JOIN expression et ON et.id = c.to_expression_id
       ${whereSql}
       GROUP BY c.from_expression_id, c.to_expression_id, c.relation
       ORDER BY MAX(c.created_at) DESC
       LIMIT ?`
    )
    .all(...params, limit);
}

// --- Session provenance ---

/** Thought/connection counts grouped by session, for a given list of session ids. */
export function sessionMemoryCounts(ids) {
  if (!ids || ids.length === 0) return {};
  const placeholders = ids.map(() => '?').join(',');
  const out = {};
  for (const id of ids) out[id] = { thoughts: 0, connections: 0 };
  for (const r of db
    .prepare(`SELECT session_id, COUNT(*) n FROM thought WHERE session_id IN (${placeholders}) GROUP BY session_id`)
    .all(...ids)) {
    if (out[r.session_id]) out[r.session_id].thoughts = r.n;
  }
  for (const r of db
    .prepare(`SELECT session_id, COUNT(*) n FROM connection WHERE session_id IN (${placeholders}) GROUP BY session_id`)
    .all(...ids)) {
    if (out[r.session_id]) out[r.session_id].connections = r.n;
  }
  return out;
}

/** Everything a single session produced: thoughts (with latest meaning) and connections. */
export function memoriesBySession(id) {
  const thoughts = db
    .prepare(
      `SELECT e.text AS expression, t.created_at,
        (SELECT m.text FROM meaning m
          WHERE m.expression_id = t.expression_id AND m.session_id = t.session_id
          ORDER BY m.created_at DESC LIMIT 1) AS meaning
       FROM thought t JOIN expression e ON e.id = t.expression_id
       WHERE t.session_id = ?
       ORDER BY t.created_at ASC`
    )
    .all(id);

  const connections = db
    .prepare(
      `SELECT ef.text AS from_expression, et.text AS to_expression, c.relation, c.created_at
       FROM connection c
       JOIN expression ef ON ef.id = c.from_expression_id
       JOIN expression et ON et.id = c.to_expression_id
       WHERE c.session_id = ?
       ORDER BY c.created_at ASC`
    )
    .all(id);

  return { thoughts, connections };
}

/** Sessions that have produced any memory (session_id present in the store). */
export function sessionsWithMemories() {
  return db
    .prepare(
      `SELECT session_id,
        COUNT(*) AS thoughts,
        MIN(created_at) AS first_at,
        MAX(created_at) AS last_at
       FROM thought
       WHERE session_id IS NOT NULL
       GROUP BY session_id
       ORDER BY last_at DESC`
    )
    .all();
}

// --- SQL console ---

const MAX_ROWS = 2000;

/** Run an arbitrary statement on the read-only connection. Writes throw at the SQLite layer. */
export function runSql(sql) {
  try {
    const stmt = db.prepare(sql);
    if (!stmt.reader) {
      // Non-SELECT on a readonly DB: .run() will throw for writes; surface that.
      const info = stmt.run();
      return { columns: ['changes', 'lastInsertRowid'], rows: [{ changes: info.changes, lastInsertRowid: String(info.lastInsertRowid) }], truncated: false };
    }
    const rows = stmt.all();
    const columns = stmt.columns().map((c) => c.name);
    const truncated = rows.length > MAX_ROWS;
    return { columns, rows: truncated ? rows.slice(0, MAX_ROWS) : rows, truncated };
  } catch (e) {
    return { error: e.message };
  }
}
