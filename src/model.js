import db from './db.js';

// --- Observer ---

export function ensureObserver(name) {
  db.prepare(`INSERT OR IGNORE INTO observer (name) VALUES (?)`).run(name);
  return db.prepare(`SELECT * FROM observer WHERE name = ?`).get(name);
}

// --- Expression ---

function ensureExpression(text) {
  db.prepare(`INSERT OR IGNORE INTO expression (text) VALUES (?)`).run(text);
  return db.prepare(`SELECT * FROM expression WHERE text = ?`).get(text);
}

// --- Core operations ---

/**
 * Record that an observer encountered an expression, optionally with a meaning.
 * Returns the thought id.
 */
export function remember(observerName, expressionText, meaningText = null, ctx = {}) {
  const observer = ensureObserver(observerName);
  const expression = ensureExpression(expressionText);
  const sessionId = ctx.sessionId ?? null;

  const thought = db.prepare(`
    INSERT INTO thought (observer_id, expression_id, session_id) VALUES (?, ?, ?)
  `).run(observer.id, expression.id, sessionId);

  let meaning = null;
  if (meaningText) {
    meaning = db.prepare(`
      INSERT INTO meaning (observer_id, expression_id, text, session_id) VALUES (?, ?, ?, ?)
    `).run(observer.id, expression.id, meaningText, sessionId);
  }

  return { thoughtId: thought.lastInsertRowid, meaningId: meaning?.lastInsertRowid ?? null };
}

/**
 * Record a connection between two expressions from an observer's perspective.
 */
export function connect(observerName, fromText, toText, relation = null, ctx = {}) {
  const observer = ensureObserver(observerName);
  const from = ensureExpression(fromText);
  const to = ensureExpression(toText);

  const result = db.prepare(`
    INSERT INTO connection (observer_id, from_expression_id, to_expression_id, relation, session_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(observer.id, from.id, to.id, relation, ctx.sessionId ?? null);

  return { connectionId: result.lastInsertRowid };
}

/**
 * Recall recent thoughts and meanings for an observer.
 * Returns a flat list of { expression, meaning, created_at } records,
 * most recent first.
 */
export function recall(observerName, limit = 100) {
  const observer = db.prepare(`SELECT * FROM observer WHERE name = ?`).get(observerName);
  if (!observer) return [];

  // Most recent meaning per expression for this observer, plus thoughts without meanings
  const rows = db.prepare(`
    SELECT
      e.text        AS expression,
      m.text        AS meaning,
      t.created_at  AS thought_at,
      m.created_at  AS meaning_at
    FROM thought t
    JOIN expression e ON e.id = t.expression_id
    LEFT JOIN meaning m
      ON m.expression_id = t.expression_id
      AND m.observer_id = t.observer_id
    WHERE t.observer_id = ?
    ORDER BY t.created_at DESC
    LIMIT ?
  `).all(observer.id, limit);

  return rows;
}

/**
 * Aggregated recall: one row per expression, with thought_count and last_thought_at.
 * The meaning is the most recent meaning for that expression by this observer.
 * Order: most recently encountered first. Limit applies to expressions, not raw thoughts.
 *
 * If `project` is given (a project slug), the result is scoped *inclusively*:
 * expressions tagged `in_project=<project>` are included, plus any expression
 * with no `in_project` tag at all (so cross-project memories like preferences
 * remain visible). Pass null/undefined for a fully unfiltered global recall.
 */
export function recallAggregated(observerName, limit = 100, project = null) {
  const observer = db.prepare(`SELECT * FROM observer WHERE name = ?`).get(observerName);
  if (!observer) return [];

  const projectClause = project ? `
    AND (
      NOT EXISTS (
        SELECT 1 FROM connection cp
        WHERE cp.from_expression_id = e.id
          AND cp.relation = 'in_project'
          AND cp.observer_id = ?
      )
      OR EXISTS (
        SELECT 1 FROM connection cp
        JOIN expression pe ON pe.id = cp.to_expression_id
        WHERE cp.from_expression_id = e.id
          AND cp.relation = 'in_project'
          AND cp.observer_id = ?
          AND pe.text = ?
      )
    )` : '';

  const sql = `
    SELECT
      e.text                    AS expression,
      COUNT(t.id)               AS thought_count,
      MAX(t.created_at)         AS last_thought_at,
      (SELECT m.text       FROM meaning m WHERE m.expression_id = e.id AND m.observer_id = ? ORDER BY m.created_at DESC LIMIT 1) AS meaning,
      (SELECT m.created_at FROM meaning m WHERE m.expression_id = e.id AND m.observer_id = ? ORDER BY m.created_at DESC LIMIT 1) AS meaning_at
    FROM thought t
    JOIN expression e ON e.id = t.expression_id
    WHERE t.observer_id = ?
      ${projectClause}
    GROUP BY e.id, e.text
    ORDER BY MAX(t.created_at) DESC
    LIMIT ?
  `;

  const params = project
    ? [observer.id, observer.id, observer.id, observer.id, observer.id, project, limit]
    : [observer.id, observer.id, observer.id, limit];

  return db.prepare(sql).all(...params);
}

/**
 * Recall connections for an observer, optionally filtered to a specific expression.
 */
export function recallConnections(observerName, expressionText = null) {
  const observer = db.prepare(`SELECT * FROM observer WHERE name = ?`).get(observerName);
  if (!observer) return [];

  if (expressionText) {
    return db.prepare(`
      SELECT
        ef.text AS from_expression,
        et.text AS to_expression,
        c.relation,
        c.created_at
      FROM connection c
      JOIN expression ef ON ef.id = c.from_expression_id
      JOIN expression et ON et.id = c.to_expression_id
      WHERE c.observer_id = ?
        AND (ef.text = ? OR et.text = ?)
      ORDER BY c.created_at DESC
    `).all(observer.id, expressionText, expressionText);
  }

  return db.prepare(`
    SELECT
      ef.text AS from_expression,
      et.text AS to_expression,
      c.relation,
      c.created_at
    FROM connection c
    JOIN expression ef ON ef.id = c.from_expression_id
    JOIN expression et ON et.id = c.to_expression_id
    WHERE c.observer_id = ?
    ORDER BY c.created_at DESC
  `).all(observer.id);
}

/**
 * Aggregated connections: one row per (from, to, relation), with count and last assertion date.
 * Most recently asserted first.
 *
 * `in_project` connections are always elided from the result — they are scoping
 * metadata, not user-facing knowledge. If `project` is given, result is scoped
 * to connections whose `from` side is either tagged for that project or untagged.
 */
export function recallConnectionsAggregated(observerName, project = null) {
  const observer = db.prepare(`SELECT * FROM observer WHERE name = ?`).get(observerName);
  if (!observer) return [];

  const projectClause = project ? `
    AND (
      NOT EXISTS (
        SELECT 1 FROM connection cp
        WHERE cp.from_expression_id = c.from_expression_id
          AND cp.relation = 'in_project'
          AND cp.observer_id = ?
      )
      OR EXISTS (
        SELECT 1 FROM connection cp
        JOIN expression pe ON pe.id = cp.to_expression_id
        WHERE cp.from_expression_id = c.from_expression_id
          AND cp.relation = 'in_project'
          AND cp.observer_id = ?
          AND pe.text = ?
      )
    )` : '';

  const sql = `
    SELECT
      ef.text             AS from_expression,
      et.text             AS to_expression,
      c.relation          AS relation,
      COUNT(c.id)         AS n,
      MAX(c.created_at)   AS last_at
    FROM connection c
    JOIN expression ef ON ef.id = c.from_expression_id
    JOIN expression et ON et.id = c.to_expression_id
    WHERE c.observer_id = ?
      AND (c.relation IS NULL OR c.relation != 'in_project')
      ${projectClause}
    GROUP BY c.from_expression_id, c.to_expression_id, c.relation
    ORDER BY MAX(c.created_at) DESC
  `;

  const params = project
    ? [observer.id, observer.id, observer.id, project]
    : [observer.id];

  return db.prepare(sql).all(...params);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Scan a text blob for expressions this observer has encountered.
 * Uses case-insensitive word-boundary matching. Ranks by specificity
 * (length of matched name) and activity (thought count, recency).
 *
 * Returns [{ expression, score, thoughtCount, lastThought }, ...], top N first.
 */
export function matchEntitiesInText(observerName, text, opts = {}) {
  const { maxResults = 3, minLength = 4 } = opts;
  if (!text) return [];

  const observer = db.prepare(`SELECT * FROM observer WHERE name = ?`).get(observerName);
  if (!observer) return [];

  const candidates = db.prepare(`
    SELECT
      e.id,
      e.text,
      COUNT(t.id)        AS thought_count,
      MAX(t.created_at)  AS last_thought
    FROM expression e
    JOIN thought t ON t.expression_id = e.id
    WHERE t.observer_id = ?
      AND length(e.text) >= ?
    GROUP BY e.id
  `).all(observer.id, minLength);

  const now = Date.now();
  const matches = [];

  for (const c of candidates) {
    const re = new RegExp(`\\b${escapeRegex(c.text)}\\b`, 'i');
    if (!re.test(text)) continue;

    const lengthScore = c.text.length;
    const countScore = Math.log2(c.thought_count + 1) * 2;
    const daysSince = (now - Date.parse(c.last_thought + 'Z')) / 86_400_000;
    const recencyScore = Math.max(0, 30 - daysSince) / 10;

    matches.push({
      expression: c.text,
      score: lengthScore + countScore + recencyScore,
      thoughtCount: c.thought_count,
      lastThought: c.last_thought,
    });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, maxResults);
}

/**
 * Compact context bundle for a single expression: recent thoughts, latest
 * meanings, outgoing and incoming connections. Used by the recall hook and
 * the `about` param of the MCP recall tool.
 */
export function entityContext(observerName, expressionText, opts = {}) {
  const { thoughtLimit = 3, meaningLimit = 2, connectionLimit = 8 } = opts;

  const observer = db.prepare(`SELECT * FROM observer WHERE name = ?`).get(observerName);
  const expression = db.prepare(`SELECT * FROM expression WHERE text = ?`).get(expressionText);
  if (!observer || !expression) return null;

  const thoughts = db.prepare(`
    SELECT created_at FROM thought
    WHERE observer_id = ? AND expression_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(observer.id, expression.id, thoughtLimit);

  const thoughtCount = db.prepare(`
    SELECT COUNT(*) AS n FROM thought
    WHERE observer_id = ? AND expression_id = ?
  `).get(observer.id, expression.id).n;

  const meanings = db.prepare(`
    SELECT text, created_at FROM meaning
    WHERE observer_id = ? AND expression_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(observer.id, expression.id, meaningLimit);

  const outgoing = db.prepare(`
    SELECT et.text AS to_expression, c.relation, c.created_at
    FROM connection c
    JOIN expression et ON et.id = c.to_expression_id
    WHERE c.observer_id = ? AND c.from_expression_id = ?
    ORDER BY c.created_at DESC
    LIMIT ?
  `).all(observer.id, expression.id, connectionLimit);

  const incoming = db.prepare(`
    SELECT ef.text AS from_expression, c.relation, c.created_at
    FROM connection c
    JOIN expression ef ON ef.id = c.from_expression_id
    WHERE c.observer_id = ? AND c.to_expression_id = ?
    ORDER BY c.created_at DESC
    LIMIT ?
  `).all(observer.id, expression.id, connectionLimit);

  return {
    expression: expressionText,
    thoughtCount,
    thoughts,
    meanings,
    outgoing,
    incoming,
  };
}

/**
 * Full context for a single expression — all meanings and connections from this observer.
 */
export function reflect(observerName, expressionText) {
  const observer = db.prepare(`SELECT * FROM observer WHERE name = ?`).get(observerName);
  const expression = db.prepare(`SELECT * FROM expression WHERE text = ?`).get(expressionText);
  if (!observer || !expression) return null;

  const thoughts = db.prepare(`
    SELECT created_at FROM thought
    WHERE observer_id = ? AND expression_id = ?
    ORDER BY created_at ASC
  `).all(observer.id, expression.id);

  const meanings = db.prepare(`
    SELECT text, created_at FROM meaning
    WHERE observer_id = ? AND expression_id = ?
    ORDER BY created_at ASC
  `).all(observer.id, expression.id);

  const connections = recallConnections(observerName, expressionText);

  return { expression: expressionText, thoughts, meanings, connections };
}
