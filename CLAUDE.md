# CLAUDE.md

See [README.md](./README.md) for what's shipped, [BasketGap.md](./BasketGap.md)
for the full specification, and [docs/decisions.md](./docs/decisions.md) for
the log of choices made outside the spec's explicit defaults — read that
before assuming a design question is still open. This file covers the
agent-delegation hierarchy, the verification loop, and day-to-day commands.

## Agent roster and delegation

The active Claude Code session is the **Director**, defined in
`.claude/agents/director.md` (Fable 5, high effort — set the session model
with `/model`, this file can't force it). Doctrine, operator-set 14 Aug 2026:
the Director never does the work itself, is the fleet's sole judge (verdicts
are never delegated), and owns the final synthesis. It analyses each job,
distributes it to the tier below, verifies what comes back against ground
truth (runs the actual commands, opens the actual files — never trusts a
self-report), and re-dispatches rather than patches when work falls short.

| Tier                            | Engines                                                              | Route here                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Complex agentic work**        | `deep-builder` (Opus 5, high) · `codex-sol` (gpt-5.6-sol, high)      | Matching-engine pipeline changes, new retailer adapters, multi-file refactors, subtle-mistake-is-expensive work                   |
| **Low-complexity agentic work** | `bulk-worker` (Sonnet 5, high) · `codex-terra` (gpt-5.6-terra, high) | Well-specified execution: fixture generation, mechanical sweeps across adapters, scaffolding                                      |
| **Heavy load, less agentic**    | `codex-luna` (gpt-5.6-luna, max)                                     | Big single-shot reasoning: long-document crunching, deep analysis — thinking volume, not tool-driving                             |
| **Antigravity — fits anywhere** | `agy-worker` (Gemini via `agy`, headless)                            | Wherever it fits; leans research. Third model family for opinions. **No sandbox on this route — read-and-reason dispatches only** |
| **Web research**                | `search-scout` (Sonnet 5, high)                                      | Retailer page structure, pricing-API shapes, fact verification                                                                    |

Full agent definitions are in `.claude/agents/`. Invoke with the `Agent`
tool and the matching `subagent_type`.

**Routing principles** (operator doctrine, 14 Aug 2026 — there is no
sol→terra→luna escalation ladder; match tier to complexity directly):

1. Low-complexity work on the complex tier wastes money; complex work on the
   low tier wastes a round trip.
2. Independence is the point of the non-Claude engines — for a real second
   opinion, send the problem **without** the proposed answer.
3. External facts go to `search-scout` or `agy-worker` first; builders never
   guess at them.
4. Parallelise independent dispatches — multiple `Agent` calls in one message.
5. Surface disagreement between engines; never silently pick one.

### Dispatch mechanism: bridge scripts, not raw CLI calls

The Codex and Antigravity tiers dispatch through tested bridge scripts —
`.claude/bin/codex-bridge.sh` and `.claude/bin/agy-bridge.sh` — not raw
`codex exec` / `agy` invocations. The bridges handle prompt-file staging
(never argv — quotes/newlines get mangled), stdout/stderr separation, and
strict failure semantics (a `"status":"SUCCESS"` envelope with no usable
`response` field is still a failed dispatch). Their own test suite
(`.claude/bin/tests/test-bridges.sh`, 63 assertions against fake shims, no
auth needed) passed unmodified on this local machine, confirmed
2026-08-14.

```
# Codex tiers (sol/terra/luna) — prompt passed as a FILE, not inline
.claude/bin/codex-bridge.sh <gpt-5.6-sol|gpt-5.6-terra|gpt-5.6-luna> <effort> <read-only|workspace-write> <prompt-file>

# Antigravity tier — prompt passed as a FILE, not inline
.claude/bin/agy-bridge.sh <low|medium|high> <prompt-file>
```

Both are already installed and authenticated on this machine — Codex via
ChatGPT login, `agy` via free Google account login, no API key either way.
`codex` is on PATH; `agy` needs `%LOCALAPPDATA%\agy\bin` on PATH (the
installer added it to the registry — a fresh terminal picks it up
automatically; an already-open shell needs
`export PATH="$PATH:[agy-install-dir]"` for that session).

`agy-bridge.sh` always runs `--dangerously-skip-permissions` (headless mode
has no terminal to answer a permission prompt) with no sandbox — its
`--sandbox` argument form is unverified upstream, so it's deliberately not
wired in. Prefer read-and-report prompts on this route; see
`agy-worker.md` for the full failure discipline.

## The verification loop (non-negotiable)

No delegated task, from any tier, is accepted until the Director has:

1. Read the actual diff or output — not just the dispatched agent's
   self-report of success.
2. Run `pnpm -r lint`, `pnpm -r typecheck`, and `pnpm -r test` clean from the
   repo root (or the equivalent scoped command inside `packages/workers` if
   the task only touched that package).
3. If the task touched the matching pipeline, confirmed the degradation
   path still holds: with no `GEMINI_API_KEY` the engine runs trigram-only
   and rank-only, i.e. fully offline deterministic. This is documented,
   load-bearing behavior — a change that quietly requires the key to
   function is a regression, not an improvement.
4. Actually exercised the change — run the relevant `workers` CLI command
   against real or fixture data (`pnpm --filter @basketgap/workers ingest ...`,
   `... match --line "..."`, etc.), not just read the code.
5. Recorded any decision made outside the spec's explicit defaults in
   `docs/decisions.md`, and updated `README.md`'s Status section if the
   change ships new user-facing capability.

If any of these fail, the task is not accepted — it goes back to the same
tier, or a different tier at the same complexity level, with specific
feedback on what failed and what "done" requires (there is no fixed
escalation ladder; match the re-dispatch to what the failure actually
suggests was missing). Per the Director's own doctrine (`director.md`), it
never patches the work itself, even a trivial fix — that turns it into a
worker and hides the failure. Everything goes back to a dispatching tier.

## Commands

Root (fans out across the `pnpm-workspace.yaml` packages):

- `pnpm -r lint` / `pnpm -r typecheck` / `pnpm -r test`
- `pnpm format` / `pnpm format:check`

Workspace packages:

- `@basketgap/shared` — database schema, matching engine, eval harness, and playground
- `@basketgap/workers` — ingestion, canonical seed, SKU enrichment, and matching CLI
- `@basketgap/api` — Hono `/api/match` API and Vercel/Node adapters

Package commands:

- `pnpm --filter @basketgap/workers ping`
- `pnpm --filter @basketgap/workers ingest coles-pdf|woolies-pdf|coles-web|woolies-web [--fixture <path> | --source-url <url>] [--dry-run] [--force-refresh]`
- `pnpm --filter @basketgap/workers exec tsx src/cli.ts match --line "<text>" | --list <file>|-`
- `pnpm --filter @basketgap/workers exec tsx src/cli.ts seed canonical [--dry-run] [--force-refresh]`
- `pnpm --filter @basketgap/workers exec tsx src/cli.ts enrich-skus [--retailer coles|woolies] [--limit N] [--dry-run]`
- `pnpm --filter @basketgap/shared db:pull` (Drizzle schema pull)
- `pnpm --filter @basketgap/shared test:eval`
- `pnpm --filter @basketgap/shared playground`
- `pnpm --filter @basketgap/api dev` (Vercel development server)
- `pnpm --filter @basketgap/api dev:node` (standalone Node development server)

All of the above read `.env.local` at the repo root via `--env-file`; it
currently holds placeholders (see project notes) — real
credentials are a prerequisite for anything beyond dry-run/fixture use.

## Repo etiquette

- Single branch today: `main`, tracked against `origin/main`
  (`github.com/shaonsourav-web/BasketGap`).
- Commit style is Conventional Commits, scoped: `feat(workers): ...`,
  `feat(adapters): ...`, `docs: ...` — match this pattern, don't invent a new
  one.
- Package manager is pnpm 11, pinned via `packageManager` in the root
  `package.json` and Corepack; Node is pinned to `>=24.0.0 <25` via
  `.nvmrc` and every package's `engines.node`. Don't drift off either.
