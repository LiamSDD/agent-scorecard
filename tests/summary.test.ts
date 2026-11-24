import { describe, expect, it } from "vitest";
import { runChecks } from "@/lib/checks";
import { ReviewSummarySchema } from "@/lib/review/schema";
import { buildReviewSummary, summaryByteLength } from "@/lib/review/summary";
import { buildRun, finalText, readStep, sampleRun, userLine } from "./helpers";

describe("buildReviewSummary", () => {
  it("produces a schema-valid summary for every sample", () => {
    for (const id of ["clean", "risky", "wasteful"] as const) {
      const run = sampleRun(id);
      const summary = buildReviewSummary(run, runChecks(run));
      expect(ReviewSummarySchema.safeParse(summary).success, id).toBe(true);
      expect(summary.omittedSteps).toBe(0);
    }
  });

  it("numbers steps from 1 so citations match the timeline labels", () => {
    const run = sampleRun("clean");
    const summary = buildReviewSummary(run, runChecks(run));
    expect(summary.steps[0].turn).toBe(1);
    expect(summary.steps.at(-1)?.turn).toBe(run.turns.length);
  });

  it("redacts secrets everywhere they could appear", () => {
    const run = sampleRun("risky");
    const text = JSON.stringify(buildReviewSummary(run, runChecks(run)));
    expect(text).not.toContain("sk-ant-api03");
    expect(text).toContain("[REDACTED]");
  });

  it("never includes file contents returned by Read", () => {
    const run = buildRun([userLine("look"), ...readStep("/secret-plan.md", "TOP SECRET CONTENT OF THE FILE"), finalText("Read it.")]);
    const text = JSON.stringify(buildReviewSummary(run, runChecks(run)));
    expect(text).toContain("/secret-plan.md");
    expect(text).not.toContain("TOP SECRET CONTENT");
  });

  it("includes failing command output excerpts so the reviewer can see what broke", () => {
    const run = sampleRun("risky");
    const summary = buildReviewSummary(run, runChecks(run));
    const failing = summary.steps.flatMap((step) => step.tools).find((tool) => tool.error);
    expect(failing?.outputExcerpt).toMatch(/failed/);
  });

  it("drops middle steps to fit the byte cap and reports how many were omitted", () => {
    const run = sampleRun("wasteful");
    const checks = runChecks(run);
    const full = buildReviewSummary(run, checks);
    const capped = buildReviewSummary(run, checks, 4000);
    expect(summaryByteLength(capped)).toBeLessThanOrEqual(4000);
    expect(capped.omittedSteps).toBeGreaterThan(0);
    expect(capped.steps.length + capped.omittedSteps).toBe(full.steps.length);
    expect(capped.steps[0].turn).toBe(1);
    expect(capped.steps.at(-1)?.turn).toBe(run.turns.length);
  });

  it("carries check results and the hygiene score", () => {
    const run = sampleRun("risky");
    const summary = buildReviewSummary(run, runChecks(run));
    expect(summary.hygieneScore).toBe(35);
    expect(summary.checks.find((check) => check.id === "destructive-commands")).toMatchObject({ status: "fail" });
  });
});
