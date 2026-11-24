import { describe, expect, it } from "vitest";
import { CHECK_DEFINITIONS, runChecks } from "@/lib/checks";
import { computeHygieneScore } from "@/lib/checks/score";
import type { CheckResult, CheckStatus } from "@/lib/checks/types";
import { sampleRun } from "./helpers";

const result = (weight: number, status: CheckStatus): CheckResult => ({
  id: "secrets",
  title: "t",
  description: "d",
  status,
  summary: "s",
  evidence: [],
  weight,
});

describe("computeHygieneScore", () => {
  it("check weights sum to 100", () => {
    expect(CHECK_DEFINITIONS.reduce((sum, check) => sum + check.weight, 0)).toBe(100);
  });

  it("scores 100 when every check passes", () => {
    expect(computeHygieneScore([result(60, "pass"), result(40, "pass")])).toMatchObject({ score: 100, grade: "good" });
  });

  it("deducts the full weight for a failure and half for a warning", () => {
    const score = computeHygieneScore([result(50, "fail"), result(20, "warn"), result(30, "pass")]);
    expect(score.score).toBe(40);
    expect(score.lines.map((line) => line.deduction)).toEqual([50, 10, 0]);
    expect(score.grade).toBe("poor");
  });

  it("normalises when weights do not sum to 100", () => {
    expect(computeHygieneScore([result(10, "warn"), result(10, "pass")]).score).toBe(75);
    expect(computeHygieneScore([]).score).toBe(100);
  });

  it("orders the samples clean, wasteful, risky with stable scores", () => {
    const scores = (["clean", "wasteful", "risky"] as const).map((id) => computeHygieneScore(runChecks(sampleRun(id))));
    expect(scores.map((score) => score.score)).toEqual([100, 83, 35]);
    expect(scores.map((score) => score.grade)).toEqual(["good", "fair", "poor"]);
  });
});
