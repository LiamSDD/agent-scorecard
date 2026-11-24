import Link from "next/link";
import { SampleCard } from "@/components/sample-card";
import { SAMPLE_IDS } from "@/data/samples";
import { runChecks } from "@/lib/checks";
import { computeHygieneScore } from "@/lib/checks/score";
import { loadSample } from "@/lib/samples.server";

export default async function HomePage() {
  const samples = await Promise.all(SAMPLE_IDS.map((id) => loadSample(id)));
  return (
    <div className="container-page py-10 sm:py-16">
      <section aria-labelledby="hero-title" className="max-w-[720px]">
        <h1 id="hero-title" className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[36px]">
          Scorecards for AI coding agent runs.
        </h1>
        <p className="mt-3 text-[16px] text-muted sm:text-[18px]">
          Drop in a Claude Code transcript, see what the agent did, what it cost, and whether the work holds up.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/runs/clean" className="btn btn-primary">
            Open a sample run
          </Link>
          <Link href="/upload" className="btn">
            Upload a transcript
          </Link>
        </div>
        <p className="mt-4 text-[13px] text-muted">
          No account and no API key needed. Parsing, cost estimates and checks run in your browser.
        </p>
      </section>

      <section aria-labelledby="samples-title" className="mt-12 sm:mt-16">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="samples-title" className="text-[18px] font-semibold">
            Sample runs
          </h2>
          <Link href="/compare" className="text-[14px]">
            Compare two runs
          </Link>
        </div>
        <p className="mt-1 text-[14px] text-muted">
          Three synthetic Claude Code sessions, built to show what the checks catch.
        </p>
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          {samples.map((sample) => {
            const checks = runChecks(sample.run);
            return (
              <SampleCard
                key={sample.meta.id}
                meta={sample.meta}
                run={sample.run}
                checks={checks}
                score={computeHygieneScore(checks)}
              />
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="what-title" className="mt-12 grid gap-6 border-t border-border pt-8 sm:grid-cols-3">
        <h2 id="what-title" className="sr-only">
          What you get
        </h2>
        {[
          ["Timeline", "Every API call with its tool calls, tokens and estimated cost. Bash commands in full, filterable by tool."],
          ["Checks", "Seven deterministic checks: destructive commands, leaked secrets, unverified edits, ignored failures, repeated reads, long context and expensive subagents."],
          ["AI review", "Optional LLM-as-judge scorecard. You see the exact summary before it is sent, and your key is never stored."],
        ].map(([title, body]) => (
          <div key={title}>
            <h3 className="text-[15px] font-semibold">{title}</h3>
            <p className="mt-1 text-[14px] text-muted">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
