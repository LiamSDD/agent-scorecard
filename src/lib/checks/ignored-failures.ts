import type { Run, ToolCall } from "../transcript/types";
import { allToolCalls, bashCommand, commandSignature } from "./helpers";
import { plural, worstStatus, type CheckMeta, type CheckResult, type CheckStatus, type Evidence } from "./types";

const FAILURE_OUTPUT_INSENSITIVE =
  /exit code [1-9]\d*|npm ERR!|\b[1-9]\d* (?:failed|failing)\b|Traceback \(most recent call last\)|error TS\d+|command not found|Build failed|panicked at/i;
const FAILURE_OUTPUT_SENSITIVE = /\bFAIL(?:ED)?\b/;
const EXPLORATORY = new Set(["grep", "rg", "find", "ls", "cat", "head", "tail", "which", "test", "diff", "[", "wc", "echo"]);
const ACKNOWLEDGED = /\b(?:fail(?:s|ed|ing|ure)?|error|broken|not (?:yet )?pass|still red|did not pass|didn't pass|could not|couldn't)\b/i;

export function commandFailed(call: ToolCall): boolean {
  if (!call.result) return false;
  if (call.result.isError) return true;
  return FAILURE_OUTPUT_INSENSITIVE.test(call.result.text) || FAILURE_OUTPUT_SENSITIVE.test(call.result.text);
}

export const IGNORED_FAILURES_META: CheckMeta = {
  id: "ignored-failures",
  title: "Failing commands ignored",
  description:
    "Finds shell commands that failed (error result, non-zero exit, FAIL output) and were never re-run successfully. Fails when the final answer does not mention the failure.",
  weight: 15,
};

export function checkIgnoredFailures(run: Run): CheckResult {
  const calls = allToolCalls(run)
    .map((call) => ({ call, command: bashCommand(call) }))
    .filter((item): item is { call: ToolCall; command: string } => item.command !== null);
  const acknowledged = ACKNOWLEDGED.test(run.finalAnswer);
  const evidence: Evidence[] = [];
  let failures = 0;
  calls.forEach(({ call, command }, position) => {
    if (!commandFailed(call)) return;
    const signature = commandSignature(command);
    if (!signature || EXPLORATORY.has(signature)) return;
    failures += 1;
    const recovered = calls
      .slice(position + 1)
      .some((later) => commandSignature(later.command) === signature && later.call.result && !commandFailed(later.call));
    if (recovered) return;
    const severity: CheckStatus = acknowledged ? "warn" : "fail";
    evidence.push({
      turnIndex: call.turnIndex,
      label: acknowledged
        ? `"${signature}" failed and was never re-run successfully (mentioned in the final answer)`
        : `"${signature}" failed and was never re-run successfully`,
      detail: command,
      severity,
    });
  });
  const status = worstStatus(evidence.map((item) => item.severity));
  return {
    ...IGNORED_FAILURES_META,
    status,
    summary:
      failures === 0
        ? "No failing commands."
        : evidence.length === 0
          ? `${plural(failures, "failing command")}, all re-run successfully later.`
          : `${plural(evidence.length, "failing command")} never recovered${status === "fail" ? " and not mentioned in the final answer" : ""}.`,
    evidence,
  };
}
