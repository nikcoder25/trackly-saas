# Lint configuration — pending follow-up

`npm run lint` in `trackly-nextjs/` is currently a no-op
(`echo "lint: no-op (eslint config pending) — see docs/LINT-TODO.md"`).
This is a deliberate pre-launch shim, not a permanent state.

## Why

Next 16 removed the bundled `next lint` command. The previous script
(`"lint": "next lint"`) errored out with
`Invalid project directory provided, no such directory: .../trackly-nextjs/lint`
because the `next` CLI now interprets the bare word `lint` as a path
argument. The repo also has no `eslint.config.*` / `.eslintrc.*` file.

Net effect pre-PR: there was no lint coverage on the project at all,
and `npm run lint` exited non-zero, which blocked any pre-commit /
CI hook that ran the script.

The pre-launch fix-up bundle replaced the script with a clear
informational echo so:

1. The script doesn't fail under any harness that runs it.
2. Anyone reading the script output knows exactly why and where the
   real follow-up lives (this file).

## Follow-up scope

A proper PR should:

1. **Add ESLint 9 + the Next config**:
   ```bash
   cd trackly-nextjs
   npm install --save-dev eslint@9 eslint-config-next@16 \
     @typescript-eslint/parser @typescript-eslint/eslint-plugin
   ```

2. **Add `eslint.config.mjs`** at `trackly-nextjs/eslint.config.mjs`
   using flat config (the only form ESLint 9 supports). Start by
   extending `eslint-config-next/core-web-vitals` and
   `@typescript-eslint/recommended`. Project conventions worth
   considering as rules (off by default — turn on as the team
   agrees):
   - `@typescript-eslint/no-explicit-any`: warn (the run-worker uses
     `any` deliberately for JSONB shape; baseline first).
   - `no-console`: warn except for `console.warn` / `console.error`
     (logger.ts intentionally falls back to `console.log`; allow it).
   - `import/no-default-export`: off (Next routes require default
     exports).

3. **Update `package.json`**:
   ```json
   "lint": "eslint . --max-warnings=0"
   ```

4. **Wire CI** at `.github/workflows/test.yml` — add a `npm run lint`
   step alongside `npx tsc --noEmit` and `npm test`. Use `--max-warnings=0`
   so a regression actually fails the run.

5. **Establish baseline**. The first run will surface a meaningful
   number of issues. Triage:
   - Fix the trivial ones in the same PR.
   - Add `// eslint-disable-next-line <rule>` with a one-line rationale
     for the rest, OR demote the rule to `warn` if the volume is too
     high to fix in one PR.

## Acceptance for the follow-up PR

- `npm run lint` runs ESLint, exits 0 on clean code, non-zero on
  warnings.
- CI workflow includes the lint step.
- This file is deleted as part of that PR (it's a TODO marker, not
  ongoing documentation).
