import type { Run } from "../transcript/types";
import { bashCommand, segmentByPrompt } from "./helpers";
import { worstStatus, type CheckMeta, type CheckResult, type CheckStatus, type Evidence } from "./types";

export const VERIFICATION_COMMAND =
  /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|build|check|typecheck|lint|verify)\b|(?:npx|bunx|pnpm\s+exec)\s+(?:vitest|jest|tsc|eslint|playwright)\b|vitest|jest|pytest|mocha|playwright\s+test|cypress\s+run|tsc\b|go\s+(?:test|build|vet)\b|cargo\s+(?:test|build|check|clippy)\b|make\s+(?:test|check|build)\b|mvn\s+\S*(?:test|verify|package)|gradle\w*\s+\S*(?:test|build|check)|rspec|phpunit|dotnet\s+(?:test|build)\b|python3?\s+-m\s+(?:pytest|unittest)|mypy|ruff\s+check)/;

export const COMPLETION_CLAIM =
  /\b(?:done|completed?|fixed|implemented|all (?:tests|checks) (?:pass|passed|passing)|tests? (?:pass|passed|passing)|ready (?:for review|to merge|to ship)|works now|should (?:now )?work|resolved)\b/i;

export const UNVERIFIED_EDITS_META: CheckMeta = {
  id: "unverified-edits",
  title: "Edits verified before completion",
  description:
    "For each user request with file changes, looks for a test, build, type-check or lint command after the last edit. Fails when the agent then claimed it was done.",
  weight: 15,
};

export function checkUnverifiedEdits(run: Run): CheckResult {
  const evidence: Evidence[] = [];
  let segmentsWithEdits = 0;
  for (const segment of segmentByPrompt(run)) {
    let lastEdit: { turnIndex: number; target: string } | null = null;
    let verifiedAfterLastEdit = false;
    for (const turn of segment.turns) {
      for (const call of turn.toolCalls) {
        if (call.category === "edit" || call.category === "write") {
          lastEdit = { turnIndex: turn.index, target: call.target };
          verifiedAfterLastEdit = false;
        } else if (lastEdit) {
          const command = bashCommand(call);
          if (command && VERIFICATION_COMMAND.test(command)) verifiedAfterLastEdit = true;
        }
      }
    }
    if (!lastEdit) continue;
    segmentsWithEdits += 1;
    if (verifiedAfterLastEdit) continue;
    const mainTexts = segment.turns.filter((turn) => turn.agentId === null && turn.text);
    const finalText = mainTexts[mainTexts.length - 1]?.text ?? "";
    const claimed = COMPLETION_CLAIM.test(finalText);
    const severity: CheckStatus = claimed ? "fail" : "warn";
    evidence.push({
      turnIndex: lastEdit.turnIndex,
      label: claimed
        ? `Last edit (${lastEdit.target}) never tested or built, yet the agent reported completion`
        : `Last edit (${lastEdit.target}) never tested or built`,
      severity,
    });
  }
  const status = worstStatus(evidence.map((item) => item.severity));
  return {
    ...UNVERIFIED_EDITS_META,
    status,
    summary:
      segmentsWithEdits === 0
        ? "No file edits in this run."
        : evidence.length === 0
          ? "Every batch of edits was followed by a test, build or type-check run."
          : status === "fail"
            ? "The agent claimed completion without running tests or a build after its last edit."
            : "Some edits were never followed by a test or build run.",
    evidence,
  };
}
