import { describe, expect, it } from "vitest";
import { checkUnverifiedEdits, COMPLETION_CLAIM, VERIFICATION_COMMAND } from "@/lib/checks/unverified-edits";
import { bashStep, buildRun, editStep, finalText, readStep, sampleRun, userLine } from "../helpers";

describe("verification and completion patterns", () => {
  it.each(["npm test", "pnpm run build", "npx vitest run", "pytest -q", "go test ./...", "cargo check", "npx tsc --noEmit", "make test", "yarn lint"])(
    "recognises %s as verification",
    (command) => {
      expect(VERIFICATION_COMMAND.test(command)).toBe(true);
    },
  );

  it("does not treat inspection commands as verification", () => {
    for (const command of ["git diff", "ls -la", "cat package.json", "npm install"]) {
      expect(VERIFICATION_COMMAND.test(command), command).toBe(false);
    }
  });

  it("recognises completion claims", () => {
    expect(COMPLETION_CLAIM.test("Done. The bug is fixed.")).toBe(true);
    expect(COMPLETION_CLAIM.test("I made the change but have not run anything.")).toBe(false);
  });
});

describe("checkUnverifiedEdits", () => {
  it("passes when edits are followed by a test run", () => {
    expect(checkUnverifiedEdits(sampleRun("clean")).status).toBe("pass");
  });

  it("passes with a clear summary when there are no edits", () => {
    const result = checkUnverifiedEdits(buildRun([userLine("explain"), ...readStep("/a.ts"), finalText("It does X.")]));
    expect(result.status).toBe("pass");
    expect(result.summary).toBe("No file edits in this run.");
  });

  it("fails when the agent claims completion without testing after its last edit", () => {
    const run = buildRun([userLine("fix it"), ...bashStep("npm test", "ok"), ...editStep("/src/a.ts"), finalText("Fixed! Everything works now.")]);
    const result = checkUnverifiedEdits(run);
    expect(result.status).toBe("fail");
    expect(result.evidence[0].label).toMatch(/reported completion/);
    expect(run.turns[result.evidence[0].turnIndex].toolCalls[0].name).toBe("Edit");
  });

  it("only warns when the final answer does not claim completion", () => {
    const run = buildRun([userLine("draft it"), ...editStep("/src/a.ts"), finalText("I drafted a change; please run the tests before merging.")]);
    expect(checkUnverifiedEdits(run).status).toBe("warn");
  });

  it("checks each user request separately", () => {
    const run = buildRun([
      userLine("first"),
      ...editStep("/a.ts"),
      ...bashStep("npm test", "ok"),
      finalText("Done."),
      userLine("second"),
      ...editStep("/b.ts"),
      finalText("Done, all set."),
    ]);
    const result = checkUnverifiedEdits(run);
    expect(result.status).toBe("fail");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].label).toContain("/b.ts");
  });
});
