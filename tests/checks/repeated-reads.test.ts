import { describe, expect, it } from "vitest";
import { checkRepeatedReads, findRedundantReads } from "@/lib/checks/repeated-reads";
import { assistantLine, buildRun, editStep, finalText, readStep, sampleRun, toolResult, toolUse, userLine } from "../helpers";

describe("checkRepeatedReads", () => {
  it("passes when every file is read once", () => {
    const result = checkRepeatedReads(sampleRun("clean"));
    expect(result.status).toBe("pass");
    expect(result.summary).toMatch(/No file was re-read/);
  });

  it("does not count a re-read after the file was edited", () => {
    const run = buildRun([userLine("go"), ...readStep("/a.ts"), ...editStep("/a.ts"), ...readStep("/a.ts"), ...editStep("/a.ts"), ...readStep("/a.ts"), finalText("ok")]);
    expect(findRedundantReads(run)).toEqual([]);
    expect(checkRepeatedReads(run).status).toBe("pass");
  });

  it("treats different ranges of the same file as different reads", () => {
    const first = toolUse("Read", { file_path: "/big.ts", offset: 1, limit: 100 });
    const second = toolUse("Read", { file_path: "/big.ts", offset: 101, limit: 100 });
    const run = buildRun([userLine("go"), assistantLine([first, second]), userLine([toolResult(first.id, "x"), toolResult(second.id, "y")]), finalText("ok")]);
    expect(findRedundantReads(run)).toEqual([]);
  });

  it("warns when one unchanged file is read three times", () => {
    const run = buildRun([userLine("go"), ...readStep("/a.ts", "x".repeat(400)), ...readStep("/a.ts", "x".repeat(400)), ...readStep("/a.ts", "x".repeat(400)), finalText("ok")]);
    const result = checkRepeatedReads(run);
    expect(result.status).toBe("warn");
    expect(result.evidence).toHaveLength(2);
    expect(result.summary).toMatch(/2 redundant reads across 1 file/);
  });

  it("only passes a single redundant read without flagging", () => {
    const run = buildRun([userLine("go"), ...readStep("/a.ts"), ...readStep("/a.ts"), finalText("ok")]);
    expect(checkRepeatedReads(run).status).toBe("pass");
    expect(findRedundantReads(run)[0].redundant).toBe(1);
  });

  it("fails the wasteful sample with an estimate of repeated tokens", () => {
    const run = sampleRun("wasteful");
    const result = checkRepeatedReads(run);
    expect(result.status).toBe("fail");
    const files = findRedundantReads(run);
    expect(files[0].path).toBe("/home/dev/shop-admin/src/reports/OrdersReport.tsx");
    expect(files.reduce((sum, file) => sum + file.redundant, 0)).toBe(10);
    expect(result.summary).toMatch(/tokens of repeated content/);
  });
});
