## What and why

<!-- What does this change, and why? Link the issue it closes, e.g. "Closes #123". -->

## Type of change

- [ ] Bug fix
- [ ] New feature or behaviour change
- [ ] Tests only
- [ ] Documentation only
- [ ] Refactor, tooling or dependencies

## Checks

Run from the repository root (CI runs the same checks):

- [ ] `pnpm -r lint` passes
- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r test` passes
- [ ] `pnpm format:check` passes
- [ ] If I changed the matching engine: `pnpm --filter @basketgap/shared test:eval` still passes, and the engine still works with no `GEMINI_API_KEY` or `OPENAI_API_KEY` set
- [ ] I added or updated tests for any behaviour change

## Content and data

- [ ] This PR contains **no retailer content**: no catalogue PDFs, no screenshots or saved copies of retailer sites or apps, no product images or logos, no real price dumps
- [ ] All test data and fixtures are synthetic (invented products and prices)
- [ ] No secrets, API keys or personal information are included

## Decisions and docs

- [ ] If this departs from `BasketGap.md` or makes a design choice the spec does not cover, I added an entry to `docs/decisions.md`
- [ ] If this changes what users or contributors see, I updated `README.md` and/or `CHANGELOG.md` (under `[Unreleased]`)
- [ ] My commit messages follow Conventional Commits with a scope, e.g. `fix(api): ...`

## Notes for the reviewer

<!-- Anything you are unsure about, trade-offs, or follow-ups. -->
