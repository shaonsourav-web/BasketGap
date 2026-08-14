# CLAUDE.md

See [README.md](./README.md) for what's shipped, [BasketGap.md](./BasketGap.md)
for the full specification, and [docs/decisions.md](./docs/decisions.md) for
the log of choices made outside the spec's explicit defaults — read that
before assuming a design question is still open. This file covers the
agent-delegation hierarchy, the verification loop, and day-to-day commands.

## Agent roster and delegation

The active Claude Code session is the **Director**. Intended driver: **Fable
5, high effort** (set with `/model` — this file can't force the session's
own model, so confirm it's actually set before relying on this). The
Director plans, decomposes work into tasks sized to the tiers below,
dispatches them, and reviews every result before accepting it. It does not
do bulk implementation itself.

| Tier                | Model            | Effort                                        | Use for                                                                                                          | Dispatch mechanism                            |
| ------------------- | ---------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Plan/review         | Fable 5          | high                                          | Planning, task breakdown, reviewing and accepting/rejecting every other tier's output                            | The Director's own reasoning — no dispatch    |
| Complex (Anthropic) | Opus 5           | high                                          | Multi-step implementation needing strong judgment — e.g. matching-engine pipeline changes, new retailer adapters | `Agent` tool, `subagent_type: "opus-heavy"`   |
| Complex (OpenAI)    | GPT-5.6 Sol      | high                                          | Same tier as Opus 5 — parallel attempt or second opinion                                                         | `codex exec` (recipe below)                   |
| Lighter (Anthropic) | Sonnet 5         | high                                          | Small, well-scoped implementation or research tasks                                                              | `Agent` tool, `subagent_type: "sonnet-light"` |
| Lighter (OpenAI)    | GPT-5.6 Terra    | high                                          | Same tier as Sonnet 5                                                                                            | `codex exec` (recipe below)                   |
| Heavy/bulk (OpenAI) | GPT-5.6 Luna     | max                                           | High-volume mechanical work: bulk fixture generation, large refactors across adapters                            | `codex exec` (recipe below)                   |
| Heavy/bulk (Google) | Gemini 3.7 Flash | high (ceiling — no `max` exists for this CLI) | Same tier as Luna, second implementation or cross-check                                                          | `agy -p` (recipe below)                       |

Codex CLI and Antigravity CLI (`agy`) are both already installed and
authenticated on this machine (ChatGPT login for Codex, Google account login
for `agy`) — no API key involved for either, confirmed working as of
2026-08-14 in the `remotejobcheck` repo. Same binaries, same auth, reusable
here without re-running any setup.

### Dispatch recipes

Run all of these with Bash `run_in_background: true` so the dispatched
model's full transcript doesn't fill the Director's context — read back only
the file passed to `-o` (or the redirected file for `agy`), once the
background job completes. Use `-s read-only` instead of `workspace-write`
for a review/analysis-only dispatch.

```
# Complex / OpenAI tier (Sol)
codex exec -m gpt-5.6-sol -c model_reasoning_effort=high -s workspace-write \
  -o <scratch-file> "<task>"

# Lighter / OpenAI tier (Terra)
codex exec -m gpt-5.6-terra -c model_reasoning_effort=high -s workspace-write \
  -o <scratch-file> "<task>"

# Heavy / OpenAI tier (Luna)
codex exec -m gpt-5.6-luna -c model_reasoning_effort=max -s workspace-write \
  -o <scratch-file> "<task>"

# Heavy / Google tier (Gemini 3.7 Flash, via Antigravity CLI)
"%LOCALAPPDATA%\agy\bin\agy.exe" -p "<task>" --model gemini-3.7-flash-high \
  --sandbox --dangerously-skip-permissions --output-format text \
  > <scratch-file>
```

`--dangerously-skip-permissions` is required for any `agy` dispatch that
writes files or runs shell commands — there's no live terminal to answer a
permission prompt, so without it a real task just hangs until `agy`'s own
timeout. `--sandbox` is the safety boundary in exchange for that — keep both
flags together, never skip permissions without the sandbox.

## The verification loop (non-negotiable)

No delegated task, from any tier, is accepted until the Director has:

1. Read the actual diff or output — not just the dispatched agent's
   self-report of success.
2. Run `pnpm -r lint`, `pnpm -r typecheck`, and `pnpm -r test` clean from the
   repo root (or the equivalent scoped command inside `packages/workers` if
   the task only touched that package).
3. If the task touched the matching pipeline, confirmed the degradation
   paths still hold: trigram-only with no `OPENAI_API_KEY`, rank-only with
   no `OPENROUTER_API_KEY`, fully offline deterministic with neither. This
   is documented, load-bearing behavior — a change that quietly requires
   both keys to function is a regression, not an improvement.
4. Actually exercised the change — run the relevant `workers` CLI command
   against real or fixture data (`pnpm --filter @basketgap/workers ingest ...`,
   `... match --line "..."`, etc.), not just read the code.
5. Recorded any decision made outside the spec's explicit defaults in
   `docs/decisions.md`, and updated `README.md`'s Status section if the
   change ships new user-facing capability.

If any of these fail, the task is not accepted. It goes back to the same
tier with specific feedback, or escalates one tier up (Terra → Sol, Sonnet →
Opus) if the failure suggests the task was under-resourced rather than just
buggy. The Director may fix genuinely trivial issues itself (a typo, a
missing import) but must say so when reporting back; anything larger goes
back to the dispatching tier instead of being silently absorbed into the
Director's own work.

## Commands

Root (fans out across the `pnpm-workspace.yaml` packages):

- `pnpm -r lint` / `pnpm -r typecheck` / `pnpm -r test`
- `pnpm format` / `pnpm format:check`

`packages/workers` (the only workspace package today; `apps/*` and
`packages/*` are reserved for future siblings per `docs/decisions.md`):

- `pnpm --filter @basketgap/workers ping`
- `pnpm --filter @basketgap/workers ingest coles-pdf|woolies-pdf|coles-web|woolies-web [--fixture <path> | --source-url <url>] [--dry-run] [--force-refresh]`
- `pnpm --filter @basketgap/workers exec tsx src/cli.ts match --line "<text>" | --list <file>|-`
- `pnpm --filter @basketgap/workers exec tsx src/cli.ts seed canonical [--dry-run] [--force-refresh]`
- `pnpm --filter @basketgap/workers exec tsx src/cli.ts enrich-skus [--retailer coles|woolies] [--limit N] [--dry-run]`
- `pnpm --filter @basketgap/workers db:pull` (Drizzle schema pull)

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
