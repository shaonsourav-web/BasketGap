# Blind gold sets

Independent labelled test sets for the matching engine, per the eval-independence
rule: builder-generated labels share the engine's blind spots, so **no set in
this folder may be written or edited by the model/session that builds the
engine**. Each file was produced by a different model reading ONLY
`seed/canonical-seed.ts` (never the dictionaries or pipeline).

- `gold-codex-2026-09-01.json` — 426 lines, GPT-5 Codex. NB: labels bare
  generic heads ("coffee", "rice", "apples") as null; the engine resolves these
  via documented HEAD_DEFAULTS, so its "false accepts" on this set are mostly
  that philosophy difference, not bugs.
- `gold-opus-2026-09-01.json` — 300 lines, Claude Opus. Labels bare heads with
  their AU default when one obviously exists; includes deliberate adversarial
  traps (green capsicum, spring onions, roast lamb leg).

Run: `pnpm exec tsx scripts/blind-eval.ts <file> [--failures]` from packages/shared.

Scores 2026-09-01 (offline deterministic path, post accuracy round):
codex 98.1% match / 0 wrong picks / 97.5% precision · opus 98.3% / 0 / 100%.
Baseline before the round: 66.5% match on the codex set.
