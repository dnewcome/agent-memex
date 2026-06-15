#!/usr/bin/env node
/**
 * capture-session.js — Stop hook that distills pansophia observations
 * from the just-completed session transcript.
 *
 * Invokes `claude -p` synchronously over the transcript, asks for a small
 * list of structured observations, and writes them via remember() / connect().
 *
 * Recursion guard: the child claude invocation runs with PANSOPHIA_DISTILLING=1.
 * If this script sees that env var on entry, it exits silently — so the child
 * session's own Stop hook becomes a no-op.
 *
 * Always exits 0. Capture failures must not break the user's session.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { remember, connect } from './model.js';
import { findProjectSlug, IN_PROJECT_RELATION } from './project.js';

if (process.env.PANSOPHIA_DISTILLING === '1') process.exit(0);

const OBSERVER = process.env.PANSOPHIA_OBSERVER ?? 'claude-code';
const MODEL = process.env.PANSOPHIA_DISTILL_MODEL ?? 'claude-haiku-4-5-20251001';
const MAX_OBSERVATIONS = parseInt(process.env.PANSOPHIA_DISTILL_MAX ?? '5', 10);
const MAX_TRANSCRIPT_BYTES = parseInt(process.env.PANSOPHIA_TRANSCRIPT_MAX ?? '200000', 10);
const TIMEOUT_MS = parseInt(process.env.PANSOPHIA_DISTILL_TIMEOUT_MS ?? '120000', 10);

const PROMPT = `You are reading the transcript of a Claude Code session that just ended.
Extract up to ${MAX_OBSERVATIONS} pansophia observations worth keeping in long-term memory.

Each observation is one of:
  { "op": "remember", "expression": "<short atomic phrase>", "meaning": "<optional 1-line interpretation>" }
  { "op": "connect",  "from": "<expression>", "to": "<expression>", "relation": "<optional verb-ish label>" }

Rules:
- Expressions are SHORT and ATOMIC — one entity or concept per phrase.
- Prefer NEW or CHANGED beliefs over restatements of obvious or already-known facts.
- Skip session-summary observations — a separate analytics tool already captures
  "what was this session about". Focus on durable knowledge: entities introduced,
  decisions made, design choices, contradictions surfaced, beliefs revised.
- If nothing is worth keeping, return [].
- Output ONLY a JSON array. No preamble, no markdown fences, no explanation.`;

async function readStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function readTranscript(path) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return null; }
  if (raw.length > MAX_TRANSCRIPT_BYTES) {
    // keep the tail — resolution/decisions tend to live near the end of a session
    raw = raw.slice(raw.length - MAX_TRANSCRIPT_BYTES);
  }
  return raw;
}

function distill(transcript) {
  const input = `${PROMPT}\n\n--- TRANSCRIPT ---\n${transcript}`;
  const result = spawnSync(
    'claude',
    ['-p', '--output-format', 'json', '--model', MODEL],
    {
      input,
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      env: { ...process.env, PANSOPHIA_DISTILLING: '1' },
    }
  );
  if (result.status !== 0) return null;

  let envelope;
  try { envelope = JSON.parse(result.stdout); } catch { return null; }
  const text = (envelope?.result ?? '').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function applyObservations(obs, projectSlug, ctx) {
  const tagged = new Set();
  const tag = (text) => {
    if (!projectSlug || !text || tagged.has(text)) return;
    tagged.add(text);
    try { connect(OBSERVER, text, projectSlug, IN_PROJECT_RELATION, ctx); } catch {}
  };

  for (const o of obs.slice(0, MAX_OBSERVATIONS)) {
    try {
      if (o?.op === 'remember' && typeof o.expression === 'string' && o.expression.trim()) {
        const expr = o.expression.trim();
        const meaning = typeof o.meaning === 'string' && o.meaning.trim() ? o.meaning.trim() : null;
        remember(OBSERVER, expr, meaning, ctx);
        tag(expr);
      } else if (
        o?.op === 'connect' &&
        typeof o.from === 'string' && o.from.trim() &&
        typeof o.to === 'string' && o.to.trim()
      ) {
        const from = o.from.trim();
        const to = o.to.trim();
        const relation = typeof o.relation === 'string' && o.relation.trim() ? o.relation.trim() : null;
        connect(OBSERVER, from, to, relation, ctx);
        tag(from);
        tag(to);
      }
    } catch { /* skip malformed entry, keep going */ }
  }
}

// The Stop-hook payload carries the session id directly; fall back to the
// transcript filename (`<sessionId>.jsonl`) if it is ever absent.
function sessionIdFrom(payload) {
  if (typeof payload?.session_id === 'string' && payload.session_id) return payload.session_id;
  const path = payload?.transcript_path;
  if (typeof path === 'string') {
    const base = path.split('/').pop() ?? '';
    if (base.endsWith('.jsonl')) return base.slice(0, -'.jsonl'.length);
  }
  return null;
}

try {
  const payload = await readStdin();
  if (!payload) process.exit(0);
  if (payload.stop_hook_active) process.exit(0);

  const transcriptPath = payload.transcript_path;
  if (!transcriptPath) process.exit(0);

  const transcript = readTranscript(transcriptPath);
  if (!transcript) process.exit(0);

  const observations = distill(transcript);
  if (!observations || observations.length === 0) process.exit(0);

  const projectSlug = findProjectSlug(payload.cwd);
  const ctx = { sessionId: sessionIdFrom(payload) };
  applyObservations(observations, projectSlug, ctx);
} catch { /* swallow — never break the session */ }

process.exit(0);
