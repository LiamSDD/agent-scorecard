"use client";

import { useState } from "react";
import { formatUsd, formatTokens } from "@/lib/cost";
import { formatDuration, formatPercent } from "@/lib/format";
import type { Run } from "@/lib/transcript/types";
import { Stat } from "./stat";

const TASK_PREVIEW_CHARS = 220;

export function shortModel(model: string): string {
  return model.replace(/^claude-/, "");
}

export function costLabel(run: Run): { value: string; hint?: string } {
  if (run.totals.costUsd === null) return { value: "unpriced", hint: "No model in this run has a known price" };
  if (run.totals.unpricedTurns > 0) {
    return { value: `≥ ${formatUsd(run.totals.costUsd)}`, hint: `${run.totals.unpricedTurns} unpriced turns excluded` };
  }
  return { value: formatUsd(run.totals.costUsd), hint: "Estimate from the pricing table" };
}

export function RunHeader({ run, source }: { run: Run; source: string }) {
  const [showFullTask, setShowFullTask] = useState(false);
  const long = run.task.length > TASK_PREVIEW_CHARS;
  const task = showFullTask || !long ? run.task : `${run.task.slice(0, TASK_PREVIEW_CHARS).trimEnd()}…`;
  const cost = costLabel(run);
  const usage = run.totals.usage;
  return (
    <section aria-labelledby="run-title" className="card p-4 sm:p-6">
      <p className="label-caps">{source}</p>
      <h1 id="run-title" className="mt-2 whitespace-pre-wrap break-words text-[18px] font-semibold leading-snug sm:text-[20px]">
        {task}
      </h1>
      {long ? (
        <button type="button" className="mt-1 text-[13px] text-accent" onClick={() => setShowFullTask((value) => !value)} aria-expanded={showFullTask}>
          {showFullTask ? "Show less" : "Show full prompt"}
        </button>
      ) : null}
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
        {run.cwd ? <span className="font-mono">{run.cwd}</span> : null}
        {run.startedAt ? <span>{run.startedAt.slice(0, 16).replace("T", " ")} UTC</span> : null}
        {run.stats.malformedCount > 0 ? (
          <span className="text-warning">
            {run.stats.malformedCount} malformed {run.stats.malformedCount === 1 ? "line" : "lines"} skipped
            {run.stats.malformedLines.length > 0 ? ` (line ${run.stats.malformedLines.slice(0, 5).join(", ")}${run.stats.malformedCount > 5 ? ", …" : ""})` : ""}
          </span>
        ) : null}
      </p>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border pt-4 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Models" value={run.models.length ? run.models.map(shortModel).join(", ") : "unknown"} />
        <Stat label="Duration" value={formatDuration(run.totals.durationMs)} />
        <Stat label="Est. cost" value={cost.value} />
        <Stat label="Turns" value={run.totals.turns} />
        <Stat label="Tool calls" value={run.totals.toolCalls} />
        <Stat label="Subagents" value={run.totals.subagents} />
        <Stat label="Cache hit" value={formatPercent(run.totals.cacheHitRate)} />
        <Stat label="Tokens" value={formatTokens(usage.input + usage.output + usage.cacheRead + usage.cacheWrite5m + usage.cacheWrite1h)} />
      </dl>
    </section>
  );
}
