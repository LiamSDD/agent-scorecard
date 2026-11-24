# Contributing

Thanks for taking the time to help.

## Setup

```bash
npm install
npm run dev
```

Before opening a pull request, make sure these all pass:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Guidelines

- Keep pull requests small and focused. Open an issue first for larger changes, such as a new check.
- Add or update tests for behaviour changes. Checks need at least one positive and one negative case.
- House style: no code comments or JSDoc in source files. Prefer clear names instead.
- Never commit real transcripts, API keys or personal data. Sample data must be synthetic.
- Transcript content must be rendered as text. Do not use `dangerouslySetInnerHTML` for anything derived from a transcript.

## Adding a check

1. Create `src/lib/checks/<name>.ts` that exports a `CheckMeta` constant and a function `(run: Run) => CheckResult`.
2. Register both in `src/lib/checks/index.ts`. Weights must still sum to 100; `tests/score.test.ts` enforces this.
3. Add `tests/checks/<name>.test.ts`.
