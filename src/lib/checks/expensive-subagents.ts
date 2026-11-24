import { costForUsage, formatUsd, lookupPricing } from "../cost";
import { PRICING_PER_MTOK } from "../config";
import type { Run, ToolCall } from "../transcript/types";
import { bashCommand } from "./helpers";
import { plural, type CheckMeta, type CheckResult, type CheckStatus, type Evidence } from "./types";

const EXPENSIVE_FAMILIES = new Set(["claude-opus-5-5", "claude-fable-5-2"]);
const READ_ONLY_BASH = /^\s*(?:cd\s+\S+\s*&&\s*)?(?:grep|rg|find|ls|cat|head|tail|wc|tree|git\s+(?:log|show|diff|status|blame|grep))\b/;
const EXPLORATION_TYPES = /explore|search|research|investigat|find|scan/i;
const CHEAP_MODEL = "claude-haiku-5-5";

export function isExpensiveModel(model: string): boolean {
  const lookup = lookupPricing(model);
  return lookup.modelId !== null && EXPENSIVE_FAMILIES.has(lookup.modelId);
}

export function isReadOnlyCall(call: ToolCall): boolean {
  if (call.category === "read" || call.category === "search" || call.category === "web" || call.category === "todo") return true;
  const command = bashCommand(call);
  return command !== null && READ_ONLY_BASH.test(command) && !/[>]|\brm\b|\bmv\b|\bsed\s+-i/.test(command);
}

export const EXPENSIVE_SUBAGENTS_META: CheckMeta = {
  id: "expensive-subagents",
  title: "Expensive models for read-only subagents",
  description:
    "Flags subagents that only read, search or grep but ran on an Opus-class model. Fails at three or more.",
  weight: 6,
};

export function checkExpensiveSubagents(run: Run): CheckResult {
  const evidence: Evidence[] = [];
  for (const agent of run.subagents) {
    const turns = agent.turnIndexes.map((index) => run.turns[index]).filter(Boolean);
    const calls = turns.flatMap((turn) => turn.toolCalls);
    if (calls.length === 0 || !calls.every(isReadOnlyCall)) continue;
    const expensiveTurns = turns.filter((turn) => isExpensiveModel(turn.model));
    if (expensiveTurns.length === 0) continue;
    const actual = expensiveTurns.reduce((sum, turn) => sum + (turn.costUsd ?? 0), 0);
    const cheap = expensiveTurns.reduce((sum, turn) => sum + costForUsage(turn.usage, PRICING_PER_MTOK[CHEAP_MODEL]), 0);
    evidence.push({
      turnIndex: expensiveTurns[0].index,
      label: `${agent.label} ran ${expensiveTurns[0].model} for ${calls.length} read-only tool calls`,
      detail: `${agent.description ?? "Exploration"}: ${formatUsd(actual)} here; about ${formatUsd(cheap)} on ${CHEAP_MODEL}.`,
      severity: "warn",
    });
  }
  if (run.subagents.length === 0) {
    for (const turn of run.turns) {
      for (const call of turn.toolCalls) {
        if (call.category !== "agent") continue;
        const model = typeof call.input.model === "string" ? call.input.model : "";
        const kind = typeof call.input.subagent_type === "string" ? call.input.subagent_type : "";
        if (/opus|fable/i.test(model) && EXPLORATION_TYPES.test(kind)) {
          evidence.push({
            turnIndex: turn.index,
            label: `Exploration subagent requested on ${model}`,
            detail: call.target,
            severity: "warn",
          });
        }
      }
    }
  }
  const status: CheckStatus = evidence.length >= 3 ? "fail" : evidence.length > 0 ? "warn" : "pass";
  return {
    ...EXPENSIVE_SUBAGENTS_META,
    status,
    summary:
      run.totals.subagents === 0
        ? "No subagents in this run."
        : evidence.length === 0
          ? `${plural(run.totals.subagents, "subagent")}, none using an expensive model for read-only work.`
          : `${plural(evidence.length, "read-only subagent")} on an expensive model.`,
    evidence: evidence.map((item) => ({ ...item, severity: status })),
  };
}
