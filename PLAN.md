# Ideas and Direction

## The core problem

Current agent memory systems (including what's built here) treat memory as a retrieval problem: store facts, fetch relevant ones. But memory in human cognition isn't primarily about retrieval — it's about *what gets kept, what gets promoted, and what gets let go*. Soni's field report on autonomous agent deployments puts it bluntly: until the memory problem is solved, the rest is theater. The failure mode isn't "agent can't find the fact" — it's "agent silently forgot something critical mid-task and proceeded anyway."

## Wastebook / Daybook as a design primitive

The historical merchant's wastebook offers a useful framing: a raw, append-only, chronological ledger of everything that happened, with the explicit expectation that most of it is noise. It isn't the memory system — it's the *input* to the memory system. The pipeline:

```
Wastebook (raw, ephemeral, append-only)
    ↓ distillation
Journal (organized, categorized)
    ↓ synthesis
Ledger (double-entry, permanent, canonical)
```

Newton developed calculus in his waste book. Faraday kept 42 years of raw lab diaries and marked passages inline as publishable. Pavlov had assistants handle raw recording and reserved interpretation for himself.

The current implementation collapses this: `remember()` is simultaneously the wastebook entry and the ledger entry. There's no intermediate layer where raw observations sit before being judged worth keeping.

What a wastebook tier might look like practically:
- Every agent interaction (tool call, observation, LLM output chunk) gets appended to a wastebook log automatically, without agent judgment
- The agent doesn't decide what to remember in the moment — it records everything and distills later
- Distillation is a separate pass: a background process (or a session-end hook) reviews the wastebook and promotes things worth keeping into the existing `thought`/`meaning` model
- The wastebook itself is truly ephemeral — it can be archived or discarded once distilled

This maps onto the pansophist model cleanly: the wastebook produces raw Expressions, distillation creates Thoughts and Meanings, the ledger is the persistent graph.

## The distillation trigger problem

Every tiered memory system has this problem and nobody has a fully satisfying answer:
- **Generative Agents** — importance scoring at write time, reflection triggered after N observations
- **Hindsight** — periodic extraction every N turns (`retainEveryNTurns`)
- **Zep** — temporal decay, things fade unless reinforced
- **Strategic Forgetting (Soni/NonBioS)** — forget irrelevant things naturally, keep contextually important ones

The wastebook framing sharpens the question: in the original system, a human merchant made the judgment call about what to promote. For agents, that's still open. Some options:
- Agent-initiated (explicit `remember()` calls) — current approach, high friction, relies on agent judgment in the moment
- Time-triggered (end of session, every N turns) — simple, misses important things that happen between ticks
- Importance-scored at write time — lightweight LLM call to score each observation before filing
- Faraday's model: inline markup at capture time ("this seems durable") without a separate processing step

## Enhanced memory as extended cognition

The deeper thread connecting wastebook, pansophist, and agent-memex is that these are all variations of the same question: how does an external system *extend* rather than *replace* human thinking?

Newton's waste book wasn't a filing system — it was a thinking surface. Faraday's lab diaries weren't records of conclusions — they were records of the process of arriving at conclusions. The published paper is the distilled artifact; the notebook is where the actual cognitive work happened.

Agent memory systems tend to be designed from the output side: what facts does the agent need to have available? But the more interesting design question is the process side: how does the agent's interaction with memory *shape its thinking*, not just inform it?

The pansophist model's observer-anchoring is one answer to this: memory isn't a flat fact store, it's a record of *who encountered what, when, and what they made of it*. That provenance is what makes memory a thinking tool rather than a database.

## Against the filesystem approach (ReadMe and similar)

A recurring pattern in minimal agent memory systems is the "semantic filesystem": store memories as markdown files, organize them temporally (year/quarter/month/day), and let the agent navigate them with shell commands. No embeddings, no vector databases, just a directory tree a human can read and edit.

This has real virtues. Transparency matters — when memory is opaque (embeddings, graphs) neither the agent nor the user can audit what was retained or why. A markdown file you can `cat` is a memory you can correct. The wastebook framing maps onto it cleanly: session logs become daily files, distillation becomes monthly summaries, the ledger becomes annual rollups.

But the filesystem approach has a structural ceiling:

**Temporal ≠ semantic.** A hierarchy organized by date answers "what happened around April 13th" but not "what does the agent know about X." The two retrieval shapes are fundamentally different. Chronological filing optimizes for the first; most actual agent work needs the second.

**No observer model.** Files have timestamps but not provenance. "memory/2026-04-13.md says X" doesn't encode *who encountered X, in what context, with what confidence*. That provenance is precisely what makes a memory a *thinking tool* rather than a log. In the pansophist model, a Thought is an event — an observer + expression + timestamp. A dated file gets the timestamp but loses the observer binding.

**The "what not to write down" problem is unsolved, not bypassed.** Filesystem-based systems defer this to the agent: write whatever seems important. But that just moves the problem. The HN discussion on ReadMe surfaces this directly — systems accumulate low-value entries, context overflows, models start ignoring the system prompt. The wastebook pipeline addresses this structurally: raw capture is automatic and cheap, distillation is deliberate and separate. Filesystem systems collapse this back into a single write decision.

**Retrieval degrades as the corpus grows.** Shell commands on a filesystem work until the memory is large enough that "navigate to the right directory" stops being tractable. The pansophist model's answer here is structural: Connections between Expressions are first-class, not inferred from co-location in a folder.

The filesystem approach is a good existence proof that transparent, human-auditable memory is achievable cheaply. The design question it leaves open is the one this project is actually after: how do you build a memory system that *reasons* about what to keep, can be interrogated about *why* something was retained, and treats provenance as a load-bearing property rather than metadata?

## Coexistence with the built-in memory system

agent-memex runs alongside Claude Code's built-in Markdown auto-memory rather than replacing it. The two systems inject independently into every session — `MEMORY.md` via the harness's built-in mechanism, pansophia via the `UserPromptSubmit` hook. From the agent's read side, this is fine: it sees the union and acts on it. The two stores have opposite default scopes, which is even complementary:

- **Built-in MEMORY** is project-local by default, keyed to the cwd at session start (`~/.claude/projects/<sanitized-cwd>/memory/`). There is no global option.
- **Pansophia** is global by default — single observer (`claude-code`), single SQLite file at `~/.local/share/pansophia/pansophia.db`. Project scoping requires either a per-project `PANSOPHIA_OBSERVER` or `PANSOPHIA_DATA_DIR`, set in that project's `.claude/settings.json` env block.

The agent's system prompt also gives the built-in store an explicit "verify before recommending" protocol that pansophia inherits only by analogy. Practically, the agent treats both as hints, not authoritative — the filesystem and running code are ground truth. When memories conflict with reality or with each other, the agent goes to source.

Where independence stops being free is on the **write side**. A new memory goes into exactly one store. Future sessions reading only the other won't see it. There is no atomic update across both, and no reconciliation pass — so the two stores drift slowly. The canonical local example is the connection `agent-memex [lang] typescript`, which contradicts the actual `src/` (all `.js`); nothing in MD echoes the claim, so there's no second source to flag the staleness.

This argues for picking one store as the system of record going forward and demoting the other to read-only legacy, rather than continuing to write to both. The README already sketches the migration path (turn off `autoMemoryEnabled` once a parser exists for the MD frontmatter format), but the path is not yet wired up — there is no migration script, and `autoMemoryEnabled` is still on.

A subtler point: even *within* pansophia, the global-by-default observer means memories from every project on the machine mix into the same recall stream. For a single user this is often desirable (cross-project preferences, recurring patterns), but it inverts the built-in system's project-local default. A clean coexistence story probably wants both axes available — per-project and global — selected by the kind of memory being written, not by which backend it lands in.

## Open questions

- What is the right granularity for a wastebook entry? An entire session? A single tool call? A turn?
- Should distillation be agent-driven, time-driven, or externally triggered (e.g. a Stop hook)?
- Is the wastebook tier separate storage, or just a view over the existing `thought` table filtered by age/promotion status?
- How does the wastebook interact with the "enhanced memory" idea — is the wastebook the user's raw stream too, or just the agent's?
- Multi-agent: if Pavlov's model maps here, which agent is the "director" doing interpretation, and which are the "assistants" doing raw recording?
- Coexistence: what triggers a reconciliation pass between MD and pansophia, and which side wins on conflict? Is the answer always "filesystem", or are there memory classes (preferences, feedback) where one store should be canonical?
- Should pansophia expose a per-memory scope tag (project / global / user) independent of which observer wrote it, so the same backend can serve both default shapes?
