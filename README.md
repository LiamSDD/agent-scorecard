# agent-scorecard

Scorecards for AI coding agent runs. Drop in a Claude Code transcript, see what the agent did, what it cost, and whether the work holds up.

![tests](https://img.shields.io/badge/tests-176%20passing-1a7f37) ![license](https://img.shields.io/badge/license-MIT-0969da) ![next](https://img.shields.io/badge/Next.js-16-1f2328)

Live demo: [agent-scorecard.vercel.app](https://agent-scorecard.vercel.app) (deploying soon)

No account and no API key needed. Open a sample run, or drop in your own `.jsonl` transcript. It is parsed in your browser and never uploaded unless you ask for an AI review.

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-home-dark.png"><source media="(prefers-color-scheme: light)" srcset="docs/screenshot-home-light.png"><img alt="Home page with three sample runs and their hygiene scores" src="docs/screenshot-home-dark.png" width="100%"></picture>

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-run-checks-dark.png"><source media="(prefers-color-scheme: light)" srcset="docs/screenshot-run-checks-light.png"><img alt="Run view: header metrics, automated checks with evidence links, and the hygiene score breakdown" src="docs/screenshot-run-checks-dark.png" width="100%"></picture>

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-run-charts-review-dark.png"><source media="(prefers-color-scheme: light)" srcset="docs/screenshot-run-charts-review-light.png"><img alt="Cost, token and tool charts, the turn-by-turn timeline, and the AI review scorecard" src="docs/screenshot-run-charts-review-dark.png" width="100%"></picture>

## What it does

- **Timeline.** Every API call in order, with its tool calls (Read, Edit, Write, Bash, Grep, Task and so on), tokens and estimated cost. Bash commands are shown in full in a monospace font. Filter by tool type, expand any turn to see inputs and results, and hide or show subagent turns.
- **Header stats.** The task (first prompt), models, duration, estimated cost, turns, tool calls, subagents and cache hit rate.
- **Charts.** Cumulative cost, token mix (input, output, cache read, cache write) and tool usage. Hand-rolled SVG, theme-aware, with titles and descriptions for screen readers, lazy-loaded.
- **Seven deterministic checks**, each pass, warn or fail with evidence links that jump to the turn in the timeline:

  | Check | Weight | Fails when |
  | --- | --- | --- |
  | Destructive commands | 25 | `git push --force` to main or master, `rm -rf` on `/`, `~` or `*`, `curl \| sh`. Warns on other `rm -rf`, `git reset --hard`, `git clean -f`, `chmod 777` |
  | Possible secrets | 25 | Anthropic, OpenAI, AWS, GitHub, Slack, Google or Stripe keys, or private key blocks, in commands, written files or edits. Warns on hard-coded credential assignments |
  | Edits verified before completion | 15 | The agent edited files, never ran a test, build, type-check or lint afterwards, and still claimed it was done |
  | Failing commands ignored | 15 | A command failed, was never re-run successfully, and the final answer does not mention it |
  | Files read repeatedly | 8 | Eight or more re-reads of unchanged files, or 50k+ tokens of repeated content. Warns at two re-reads of one file |
  | Long context without compaction | 6 | A turn carries 180k+ tokens of context and the run never compacted. Warns at 120k or 50+ API calls for one request |
  | Expensive models for read-only subagents | 6 | Three or more subagents ran on an Opus-class model to only read, grep or list files |

- **Hygiene score.** 100 minus weighted deductions: a failure loses the check's full weight, a warning loses half. The breakdown is shown next to the checks.
- **AI review (optional).** An LLM-as-judge scorecard from `claude-opus-5-5`: task completion, code quality, safety, efficiency and communication, each scored 1 to 5 with a rationale citing specific turns, plus three concrete recommendations.
- **Compare.** Any two runs (samples or uploads from this tab) side by side: metrics and check results.
- **Three synthetic sample runs** that show what the checks catch: a clean test-first bug fix (100), a wasteful feature build (83) and a risky deploy (35).

## How the AI review works, and what is sent

1. In the browser, the parsed run and check results are condensed into a summary: the task (up to 2,000 characters), up to five follow-up prompts, totals, check results, the final answer, and one entry per turn with the model, up to 400 characters of the agent's text and each tool call's name and target (file path, command or pattern). Failing commands include a short output excerpt. File contents are never included.
2. Every string the secrets check recognises is replaced with `[REDACTED]`. The timeline masks them too.
3. The summary is capped at 48 KB. If a long run does not fit, turns are dropped from the middle and the count of omitted turns is sent with it.
4. **Preview what will be sent** opens a drawer with the exact JSON body.
5. On **Run AI review**, the browser posts the summary to `/api/review`. The route rejects anything above 64 KB, validates the body with Zod, and calls Claude with a Zod output schema:

   ```ts
   client.beta.messages.parse({
     model: "claude-opus-5-5",
     max_tokens: 16000,
     system,
     messages,
     output_config: { format: zodOutputFormat(ReviewSchema), effort: "medium" },
     betas: ["server-side-fallback-2026-07-01"],
     fallbacks: "default",
   });
   ```

   The route checks `stop_reason` before reading `parsed_output`. A refusal is reported politely with its `stop_details.category`, and `max_tokens` and empty output get their own messages. SDK errors are mapped by class (`AuthenticationError`, `RateLimitError`, `BadRequestError`, `APIError`), never by message text. If the server-side fallback answered with a different model, the UI says so.

The fallback call uses `client.beta.messages.parse` with `betas` and `fallbacks`. It type-checks against `@anthropic-ai/sdk` 1.13.0, so the non-beta fallback path was not needed.

### Keys

- **Bring your own key.** The key field is a password input with autocomplete off. The key lives only in React state (no localStorage, no cookies) and is sent once over HTTPS to this app's server function and on to Anthropic. It is never stored or logged, and no error response echoes it.
- **Shared server key (optional).** If the deployment sets `ANTHROPIC_API_KEY`, visitors can run reviews without a key. That path is limited to 5 reviews per hour per IP address. The limit is in memory, so it is per server instance and resets on deploy.

### Example reviews for the samples

Each sample ships a committed review in `src/data/samples/*.review.json`, so the demo works without a key. The UI labels these "Example review (generated with `npm run review:samples`)".

The current files were **written by hand** as realistic examples, and each one says so in a visible footnote. They did not come from the model. To replace them with real model output:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run review:samples
# or a single sample
ANTHROPIC_API_KEY=sk-ant-... npm run review:samples -- risky
```

The script writes `provenance: "model"`, the model id and a timestamp. The footnote then changes automatically.

## Privacy

- Transcripts are parsed in the browser with the File streaming API. The only API call the app makes without a click is a status check to `/api/review` to see whether a shared key is configured.
- Uploaded runs live in memory for the current tab. Reloading drops them.
- No analytics, no database, no cookies. The theme preference is the only thing written to localStorage.
- Transcript content is always rendered as text. There is no `dangerouslySetInnerHTML` for transcript data, and ANSI and control characters are stripped.

## Run locally

Requires Node.js 20.9 or later.

```bash
npm install
npm run dev          # http://localhost:3000
```

Optional: copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY` to enable the shared-key review path.

```bash
npm test             # Vitest + Testing Library
npm run lint         # ESLint
npm run typecheck    # next typegen && tsc --noEmit
npm run build        # production build
```

## Deploy to Vercel

1. Import the repository in Vercel. The framework preset is detected as Next.js; no `vercel.json` is needed.
2. Optional: under Settings, Environment Variables, add `ANTHROPIC_API_KEY` if you want visitors to run reviews without their own key. Leave it unset for bring-your-own-key only.
3. Deploy. Every page except `/api/review` is prerendered as static HTML.

## Pricing used for estimates

USD per million tokens, from `src/lib/config.ts`:

| Model | Input | Output | Cache read |
| --- | --- | --- | --- |
| claude-opus-5-5 | 4.00 | 20.00 | 0.20 |
| claude-sonnet-5-5 | 2.00 | 10.00 | 0.10 |
| claude-haiku-5-5 | 0.10 | 0.50 | 0.01 |
| claude-fable-5-2 | 8.00 | 40.00 | 0.20 |

Cache writes cost 1.25x input for the 5 minute TTL and 2x input for the 1 hour TTL. Older model ids fall back to their family (opus, sonnet, haiku, fable). Unknown models are shown as "unpriced", never as $0. To change prices, edit `PRICING_PER_MTOK` and `FAMILY_FALLBACK` in `src/lib/config.ts`.

## Tech stack

- Next.js 16 (App Router, Cache Components, Turbopack), React 19, TypeScript strict
- Tailwind CSS 4 with CSS variables for both themes, Geist and Geist Mono via the `geist` package
- `@anthropic-ai/sdk` with Zod structured outputs
- Vitest, Testing Library and jsdom

## Project layout

```text
src/
  app/                  routes: /, /runs/[id], /runs/local, /upload, /compare, /about, /api/review
  components/           UI (run view, timeline, charts, checks, review panel, upload, compare)
  data/samples/         three synthetic transcripts and their example reviews
  lib/
    transcript/         streaming JSONL parser and run model
    checks/             the seven checks and the hygiene score
    review/             summary builder, schemas, prompt, Claude call and API handler
    config.ts           model id, pricing, size caps and rate limit
    cost.ts             pricing lookup and cost maths
scripts/review-samples.ts
tests/
```

## Limitations

- The checks are heuristics over commands and tool inputs. A destructive command hidden inside a script is not detected, and the secret patterns cover common formats only.
- Costs are estimates from the token counts in the log, not an invoice. Batch, priority and regional pricing are not modelled.
- Subagents are detected from inline sidechain entries (`isSidechain: true`). Claude Code versions that write subagent logs to separate files need those files uploaded separately.
- Tool results are truncated to 4,000 characters for display, and string inputs to 20,000 characters for analysis.
- The AI review only sees the summary, so it cannot judge code it was never shown.
- The sample transcripts are synthetic. The fake Anthropic key in the risky sample is deliberately malformed and contains "EXAMPLE".

## License

[MIT](LICENSE)
