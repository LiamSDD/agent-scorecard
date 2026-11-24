import { REVIEW_SUMMARY_MAX_BYTES } from "../config";
import { commandFailed } from "../checks/ignored-failures";
import { redactSecrets } from "../checks/secrets";
import { computeHygieneScore } from "../checks/score";
import type { CheckResult } from "../checks/types";
import { cacheWriteTotal } from "../cost";
import { turnNumber } from "../format";
import { oneLine, truncate } from "../sanitize";
import type { Run, Turn } from "../transcript/types";
import type { ReviewSummary } from "./schema";

const MAX_STEPS = 120;
const MAX_TOOLS_PER_STEP = 30;

function clean(value: string, max: number): string {
  return truncate(oneLine(redactSecrets(value)), max);
}

function summarizeTurn(run: Run, turn: Turn): ReviewSummary["steps"][number] {
  const agent = turn.agentId ? run.subagents.find((item) => item.id === turn.agentId)?.label : undefined;
  return {
    turn: turnNumber(turn.index),
    ...(agent ? { agent } : {}),
    model: truncate(turn.model, 80),
    ...(turn.text ? { text: clean(turn.text, 400) } : {}),
    tools: turn.toolCalls.slice(0, MAX_TOOLS_PER_STEP).map((call) => {
      const failed = call.category === "bash" ? commandFailed(call) : call.result?.isError === true;
      return {
        name: truncate(call.name, 60),
        target: clean(call.target, 240),
        ...(failed ? { error: true } : {}),
        ...(failed && call.result ? { outputExcerpt: clean(call.result.text.slice(-600), 400) } : {}),
      };
    }),
  };
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function buildReviewSummary(
  run: Run,
  checks: CheckResult[],
  maxBytes: number = REVIEW_SUMMARY_MAX_BYTES,
): ReviewSummary {
  const followUps = run.timeline
    .filter((item) => item.kind === "prompt" && item.agentId === null)
    .slice(1, 6)
    .map((item) => (item.kind === "prompt" ? clean(item.text, 400) : ""));
  const usage = run.totals.usage;
  const base: Omit<ReviewSummary, "steps" | "omittedSteps"> = {
    schemaVersion: 1,
    task: truncate(redactSecrets(run.task), 2000),
    followUps,
    models: run.models.slice(0, 10).map((model) => truncate(model, 80)),
    totals: {
      turns: run.totals.turns,
      toolCalls: run.totals.toolCalls,
      subagents: run.totals.subagents,
      durationSeconds: run.totals.durationMs === null ? null : Math.round(run.totals.durationMs / 1000),
      estimatedCostUsd: run.totals.costUsd === null ? null : Number(run.totals.costUsd.toFixed(4)),
      cacheHitRate: run.totals.cacheHitRate === null ? null : Number(run.totals.cacheHitRate.toFixed(3)),
      inputTokens: usage.input,
      outputTokens: usage.output,
      cacheReadTokens: usage.cacheRead,
      cacheWriteTokens: cacheWriteTotal(usage),
    },
    hygieneScore: computeHygieneScore(checks).score,
    checks: checks.map((check) => ({
      id: check.id,
      title: truncate(check.title, 120),
      status: check.status,
      summary: truncate(redactSecrets(check.summary), 400),
      turns: [...new Set(check.evidence.map((item) => turnNumber(item.turnIndex)))].slice(0, 20),
    })),
    finalAnswer: truncate(redactSecrets(run.finalAnswer), 2400),
  };

  const allSteps = run.turns.map((turn) => summarizeTurn(run, turn));
  let keep = Math.min(allSteps.length, MAX_STEPS);
  while (true) {
    const head = Math.ceil(keep / 2);
    const tail = keep - head;
    const steps =
      keep >= allSteps.length ? allSteps : [...allSteps.slice(0, head), ...(tail > 0 ? allSteps.slice(-tail) : [])];
    const summary: ReviewSummary = { ...base, steps, omittedSteps: allSteps.length - steps.length };
    if (keep === 0 || byteLength(summary) <= maxBytes) return summary;
    keep = Math.max(0, keep - Math.max(1, Math.ceil(keep * 0.1)));
  }
}

export function summaryByteLength(summary: ReviewSummary): number {
  return byteLength(summary);
}
