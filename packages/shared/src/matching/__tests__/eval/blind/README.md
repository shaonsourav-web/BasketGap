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
- `gold-opus-stress-2026-09-02.json` — 250 lines, Claude Opus. Adversarial
  stress set: near-miss product forms, size/qualifier contradictions and
  compound lines built to provoke a wrong pick rather than a miss.

Run: `pnpm exec tsx scripts/blind-eval.ts <file> [--failures]` from packages/shared.

Scores 2026-09-02 (offline deterministic path, unchanged by the Gemini
single-provider swap — the swap touches only the keyed tiers):

| set         | correct match | wrong picks | accepted precision     |
| ----------- | ------------- | ----------- | ---------------------- |
| codex       | 99.5%         | 0           | 97.6%                  |
| opus        | 98.3%         | 0           | 100%                   |
| opus-stress | 98.0%         | 0           | 100% (0 false accepts) |

Baseline before the accuracy round: 66.5% match on the codex set.
