# Contributing to BasketGap

Thanks for your interest. BasketGap is an early-stage project, so please open an issue to discuss anything larger than a small fix before you start work.

By contributing you agree that your contribution is licensed under the project's licence, [AGPL-3.0-only](./LICENSE). Please also read the [Code of Conduct](./CODE_OF_CONDUCT.md).

## What you must not contribute

BasketGap compares prices published by Coles and Woolworths, but this repository must never contain their content. Do not submit, in code, tests, fixtures, docs or issues:

- Retailer catalogue PDFs, in whole or in part.
- Screenshots or saved copies of retailer websites or apps.
- Product images, logos or brand artwork.
- Real price dumps, scraped product lists or exports of real catalogue data.

All test data must be synthetic: invented products, invented prices, invented layouts that exercise the parser. The synthetic examples under `packages/workers/examples/import/` show the approach. If a bug only reproduces with real retailer content, describe the shape of the problem in the issue and build a synthetic fixture that triggers it.

Pull requests that include retailer content will be closed and asked to be resubmitted without it.

## Development setup

You need:

- Node 24 (the exact range is in `.nvmrc` and each `engines.node`). Use a version manager such as nvm or fnm: `nvm use`.
- pnpm 11, pinned through the `packageManager` field. Run `corepack enable` and the right version is used automatically.

Then, from the repository root:

```bash
corepack enable
pnpm install
```

You do not need any API keys or a database to work on the matching engine. See the "Run it offline with no keys" section of the [README](./README.md). If you need to run commands that touch Postgres or the optional providers, copy `.env.example` to `.env.local` and fill in your own values. Never commit `.env.local` or real credentials.

## Checks

Run these from the repository root before opening a pull request. CI runs the same checks.

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm format:check
```

`pnpm format` rewrites files with Prettier. A pre-commit hook (husky and lint-staged) runs ESLint and Prettier on staged files.

If you change the matching engine, also run the offline evaluation and keep it green:

```bash
pnpm --filter @basketgap/shared test:eval
```

The engine must keep working with no keys set: no `GEMINI_API_KEY` means trigram-only matching, no `OPENAI_API_KEY` means rank-only decisions. A change that quietly requires a key is a regression.

## Commit messages

Use Conventional Commits with a scope, matching the existing history:

```
feat(workers): add prune-cache command
fix(api): rate-limit key on IP only
docs: clarify offline setup
test(matching): add a blind gold set
refactor(shared): simplify the ranker
```

Keep each commit focused, and explain the why in the body when it is not obvious.

## Pull requests

- Keep changes small and focused.
- Add or update tests for behaviour changes.
- Record any design decision that goes beyond the written spec in [docs/decisions.md](./docs/decisions.md).
- Update the README if you ship something users can see.
- Do not change the package manager, the Node version range, or the licence in a drive-by change.

## Reporting security problems

Do not open a public issue for a vulnerability. See [SECURITY.md](./SECURITY.md).
