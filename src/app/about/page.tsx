import type { Metadata } from "next";
import Link from "next/link";
import { ArchitectureDiagram } from "@/components/architecture-diagram";
import { CHECK_DEFINITIONS } from "@/lib/checks";
import {
  CACHE_WRITE_1H_MULTIPLIER,
  CACHE_WRITE_5M_MULTIPLIER,
  FAMILY_FALLBACK,
  PRICING_PER_MTOK,
  REVIEW_MODEL,
  REVIEW_REQUEST_MAX_BYTES,
  REVIEW_SUMMARY_MAX_BYTES,
  SHARED_KEY_RATE_LIMIT,
} from "@/lib/config";

export const metadata: Metadata = { title: "How it works" };

const usd = (value: number) => `$${value.toFixed(2)}`;

export default function AboutPage() {
  const checks = CHECK_DEFINITIONS;
  return (
    <div className="container-page max-w-[880px] py-10">
      <h1 className="text-[24px] font-semibold">How it works</h1>
      <p className="mt-2 text-[15px] text-muted">
        agent-scorecard turns a Claude Code session log into a timeline, a cost estimate, a set of deterministic checks and,
        if you ask for it, an LLM-as-judge review.
      </p>

      <section aria-labelledby="architecture" className="mt-10">
        <h2 id="architecture" className="text-[18px] font-semibold">Architecture</h2>
        <div className="card mt-3 p-3 sm:p-4">
          <ArchitectureDiagram />
        </div>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-[14px]">
          <li>The file is streamed and parsed line by line in your browser. Malformed lines are skipped and counted.</li>
          <li>
            Assistant messages are split across several lines in Claude Code logs, one per content block. Usage is counted
            once per <code>message.id</code> and <code>requestId</code>, so tokens are not double counted.
          </li>
          <li>Lines with <code>isSidechain: true</code> are grouped into subagents. All displayed text is stripped of ANSI and control characters and rendered as plain text.</li>
          <li>Costs and checks are pure functions of the parsed run and run in the browser.</li>
          <li>
            The AI review is the only step that talks to a server. It sends a summary capped at {REVIEW_SUMMARY_MAX_BYTES / 1024} KB,
            the server rejects anything above {REVIEW_REQUEST_MAX_BYTES / 1024} KB, validates it with Zod and calls{" "}
            <code>{REVIEW_MODEL}</code> with a Zod output schema.
          </li>
        </ol>
      </section>

      <section aria-labelledby="checks" className="mt-10">
        <h2 id="checks" className="text-[18px] font-semibold">Checks and score</h2>
        <p className="mt-2 text-[14px] text-muted">
          The hygiene score starts at 100. Each check has a weight; a failure loses the full weight and a warning loses
          half. Weights sum to 100.
        </p>
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[14px]">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Check</th>
                <th scope="col" className="px-4 py-2 font-medium">What it looks for</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Weight</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => (
                <tr key={check.id} className="border-b border-border align-top last:border-b-0">
                  <th scope="row" className="px-4 py-2 text-left font-medium">{check.title}</th>
                  <td className="px-4 py-2 text-muted">{check.description}</td>
                  <td className="px-4 py-2 text-right font-mono">{check.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="privacy" className="mt-10">
        <h2 id="privacy" className="text-[18px] font-semibold">Privacy</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-[14px]">
          <li>Your transcript never leaves your browser unless you run the AI review. There is no analytics and no database.</li>
          <li>Uploaded runs live in memory for the current tab only. Reloading drops them.</li>
          <li>
            The AI review sends a compact summary, not the transcript: prompts and final answer truncated, at most 400
            characters per step, no file contents, and every string the secrets check recognises replaced with
            [REDACTED]. The preview drawer shows the exact JSON before you send it.
          </li>
          <li>
            A key you enter is kept in React state only, sent once over HTTPS to this app&apos;s server function and on to
            Anthropic, and never stored or logged. It is not written to localStorage or cookies.
          </li>
          <li>
            If the operator sets <code>ANTHROPIC_API_KEY</code>, reviews without a key use it, limited to{" "}
            {SHARED_KEY_RATE_LIMIT.limit} per hour per IP address (in memory, per server instance).
          </li>
        </ul>
      </section>

      <section aria-labelledby="pricing" className="mt-10">
        <h2 id="pricing" className="text-[18px] font-semibold">Pricing used for estimates</h2>
        <p className="mt-2 text-[14px] text-muted">
          USD per million tokens. Cache writes cost {CACHE_WRITE_5M_MULTIPLIER}x the input price for the 5 minute TTL and{" "}
          {CACHE_WRITE_1H_MULTIPLIER}x for the 1 hour TTL. Older model IDs fall back to their family
          ({Object.keys(FAMILY_FALLBACK).join(", ")}); anything else is shown as unpriced, never as $0.
        </p>
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[14px]">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Model</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Input</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Output</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Cache read</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Cache write 5m / 1h</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {Object.entries(PRICING_PER_MTOK).map(([model, price]) => (
                <tr key={model} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-4 py-2 text-left font-normal">{model}</th>
                  <td className="px-4 py-2 text-right">{usd(price.input)}</td>
                  <td className="px-4 py-2 text-right">{usd(price.output)}</td>
                  <td className="px-4 py-2 text-right">{usd(price.cacheRead)}</td>
                  <td className="px-4 py-2 text-right">
                    {usd(price.input * CACHE_WRITE_5M_MULTIPLIER)} / {usd(price.input * CACHE_WRITE_1H_MULTIPLIER)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[14px]">
          To override prices, edit <code>PRICING_PER_MTOK</code> and <code>FAMILY_FALLBACK</code> in{" "}
          <code>src/lib/config.ts</code> and rebuild. Every cost in the UI is labelled as an estimate.
        </p>
      </section>

      <section aria-labelledby="limitations" className="mt-10">
        <h2 id="limitations" className="text-[18px] font-semibold">Limitations</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-[14px]">
          <li>Checks are heuristics over commands and tool inputs. They can miss a destructive command hidden in a script, and the secret patterns only cover common key formats.</li>
          <li>Cost is an estimate from token counts in the log and the table above, not your invoice. Batch, priority and regional pricing are not modelled.</li>
          <li>Subagents are detected from inline sidechain entries. Newer Claude Code versions may write subagent logs to separate files; upload those separately.</li>
          <li>Tool results longer than 4,000 characters are truncated for display, and string inputs longer than 20,000 characters for analysis.</li>
          <li>The AI review sees a summary, so it cannot judge code it was never shown. It is a second opinion, not a verdict.</li>
          <li>The shared-key rate limit is in memory, so it resets on deploy and is per instance on serverless platforms.</li>
          <li>The three sample runs are synthetic. Their example reviews were written by hand until regenerated with <code>npm run review:samples</code>.</li>
        </ul>
        <p className="mt-6">
          <Link href="/runs/clean" className="btn btn-primary">Open a sample run</Link>
        </p>
      </section>
    </div>
  );
}
