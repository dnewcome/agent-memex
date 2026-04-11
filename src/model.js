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
export function remember(observerName, expressionText, meaningText = null) {
  const observer = ensureObserver(observerName);
  const expression = ensureExpression(expressionText);

  const thought = db.prepare(`
    INSERT INTO thought (observer_id, expression_id) VALUES (?, ?)
  `).run(observer.id, expression.id);

  let meaning = null;
  if (meaningText) {
    meaning = db.prepare(`
      INSERT INTO meaning (observer_id, expression_id, text) VALUES (?, ?, ?)
    `).run(observer.id, expression.id, meaningText);
  }

  return { thoughtId: thought.lastInsertRowid, meaningId: meaning?.lastInsertRowid ?? null };
}

/**
 * Record a connection between two expressions from an observer's perspective.
 */
export function connect(observerName, fromText, toText, relation = null) {
  const observer = ensureObserver(observerName);
  const from = ensureExpression(fromText);
  const to = ensureExpression(toText);

  const result = db.prepare(`
    INSERT INTO connection (observer_id, from_expression_id, to_expression_id, relation)
    VALUES (?, ?, ?, ?)
  `).run(observer.id, from.id, to.id, relation);

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
