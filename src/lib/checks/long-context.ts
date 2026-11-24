import { formatTokens, promptTokens } from "../cost";
import type { Run } from "../transcript/types";
import { turnLabel } from "../format";
import { segmentByPrompt } from "./helpers";
import { plural, worstStatus, type CheckMeta, type CheckResult, type Evidence } from "./types";

export const LONG_CONTEXT_THRESHOLDS = {
  warnContextTokens: 120_000,
  failContextTokens: 180_000,
  warnStepsPerRequest: 50,
};

export const LONG_CONTEXT_META: CheckMeta = {
  id: "long-context",
  title: "Long context without compaction",
  description:
    `Warns when a turn carries ${formatTokens(LONG_CONTEXT_THRESHOLDS.warnContextTokens)}+ tokens of context or one request takes ${LONG_CONTEXT_THRESHOLDS.warnStepsPerRequest}+ API calls. Fails at ${formatTokens(LONG_CONTEXT_THRESHOLDS.failContextTokens)}+ tokens when the run never compacted.`,
  weight: 6,
};

export function checkLongContext(run: Run): CheckResult {
  const evidence: Evidence[] = [];
  const compacted = run.totals.compactions > 0;
  let peak = 0;
  let peakTurn = -1;
  for (const turn of run.turns) {
    const context = promptTokens(turn.usage);
    if (context > peak) {
      peak = context;
      peakTurn = turn.index;
    }
  }
  const largeTurns = run.turns.filter(
    (turn) => promptTokens(turn.usage) >= LONG_CONTEXT_THRESHOLDS.warnContextTokens,
  );
  for (const turn of largeTurns.slice(0, 10)) {
    const context = promptTokens(turn.usage);
    evidence.push({
      turnIndex: turn.index,
      label: `Context at ${formatTokens(context)} tokens`,
      severity: context >= LONG_CONTEXT_THRESHOLDS.failContextTokens && !compacted ? "fail" : "warn",
    });
  }
  for (const segment of segmentByPrompt(run)) {
    const steps = segment.turns.filter((turn) => turn.agentId === null);
    if (steps.length >= LONG_CONTEXT_THRESHOLDS.warnStepsPerRequest) {
      evidence.push({
        turnIndex: steps[0].index,
        label: `${steps.length} API calls for a single request`,
        severity: "warn",
      });
    }
  }
  const status = worstStatus(evidence.map((item) => item.severity));
  return {
    ...LONG_CONTEXT_META,
    status,
    summary:
      evidence.length === 0
        ? `Peak context ${formatTokens(peak)} tokens${peakTurn >= 0 ? ` at ${turnLabel(peakTurn)}` : ""}; well within limits.`
        : `Peak context ${formatTokens(peak)} tokens at ${turnLabel(peakTurn)}; ${plural(largeTurns.length, "turn")} above ${formatTokens(LONG_CONTEXT_THRESHOLDS.warnContextTokens)}${compacted ? "" : " and no compaction"}.`,
    evidence,
  };
}
