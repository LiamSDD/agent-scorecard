import { describe, expect, it } from "vitest";
import { commandSignature } from "@/lib/checks/helpers";
import { checkIgnoredFailures, commandFailed } from "@/lib/checks/ignored-failures";
import { bashStep, buildRun, finalText, sampleRun, userLine } from "../helpers";

describe("commandSignature", () => {
  it("normalises commands to the part that identifies the tool", () => {
    expect(commandSignature("npm test -- src/a.test.ts")).toBe("npm test");
    expect(commandSignature("cd app && npm run build")).toBe("npm run build");
    expect(commandSignature("CI=1 pytest -q tests/")).toBe("pytest");
    expect(commandSignature("git push --force origin main")).toBe("git push");
    expect(commandSignature("python -m pytest")).toBe("python -m pytest");
  });
});

describe("commandFailed", () => {
  it("detects error flags, exit codes and test-runner failure output", () => {
    const run = buildRun([
      userLine("go"),
      ...bashStep("a", "anything", true),
      ...bashStep("b", "Tests  2 failed | 3 passed"),
      ...bashStep("c", "Exit code 2"),
      ...bashStep("d", " FAIL  src/x.test.ts"),
      ...bashStep("e", "Tests  0 failed | 5 passed"),
      ...bashStep("f", "fail-fast mode enabled, all passed"),
    ]);
    expect(run.turns.map((turn) => commandFailed(turn.toolCalls[0]))).toEqual([true, true, true, true, false, false]);
  });
});

describe("checkIgnoredFailures", () => {
  it("passes when a failing command is re-run successfully", () => {
    const result = checkIgnoredFailures(sampleRun("clean"));
    expect(result.status).toBe("pass");
    expect(result.summary).toBe("1 failing command, all re-run successfully later.");
  });

  it("fails when a test failure is never fixed and the final answer is silent about it", () => {
    const run = sampleRun("risky");
    const result = checkIgnoredFailures(run);
    expect(result.status).toBe("fail");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].label).toMatch(/"npm test" failed/);
  });

  it("downgrades to a warning when the final answer acknowledges the failure", () => {
    const run = buildRun([userLine("fix"), ...bashStep("npm test", "Tests 1 failed", true), finalText("The auth test still fails; I need your input on the expected token format.")]);
    expect(checkIgnoredFailures(run).status).toBe("warn");
  });

  it("ignores exploratory commands like grep that exit non-zero on no match", () => {
    const run = buildRun([userLine("find"), ...bashStep("grep -rn TODO src", "Exit code 1", true), finalText("No TODOs.")]);
    expect(checkIgnoredFailures(run).status).toBe("pass");
  });

  it("passes when nothing failed", () => {
    const run = buildRun([userLine("go"), ...bashStep("npm test", "Tests 5 passed"), finalText("Done.")]);
    expect(checkIgnoredFailures(run)).toMatchObject({ status: "pass", summary: "No failing commands." });
  });
});
