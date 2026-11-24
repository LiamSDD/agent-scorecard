import { describe, expect, it } from "vitest";
import { checkExpensiveSubagents, isExpensiveModel, isReadOnlyCall } from "@/lib/checks/expensive-subagents";
import { assistantLine, buildRun, finalText, sampleRun, toolResult, toolUse, userLine } from "../helpers";

function subagent(prefix: string, model: string, tools: { name: string; input: Record<string, unknown> }[]) {
  const lines = [userLine("explore", { sidechain: true, uuid: `${prefix}-0`, parentUuid: null })];
  let parent = `${prefix}-0`;
  tools.forEach((tool, position) => {
    const call = toolUse(tool.name, tool.input);
    const uuid = `${prefix}-${position + 1}`;
    lines.push(assistantLine([call], { sidechain: true, model, uuid, parentUuid: parent }));
    lines.push(userLine([toolResult(call.id, "result")], { sidechain: true, uuid: `${uuid}r`, parentUuid: uuid }));
    parent = `${uuid}r`;
  });
  return lines;
}

describe("helpers", () => {
  it("classifies models by price tier", () => {
    expect(isExpensiveModel("claude-opus-5-5")).toBe(true);
    expect(isExpensiveModel("claude-fable-5-2")).toBe(true);
    expect(isExpensiveModel("claude-3-opus-20240229")).toBe(true);
    expect(isExpensiveModel("claude-haiku-5-5")).toBe(false);
    expect(isExpensiveModel("unknown")).toBe(false);
  });

  it("classifies read-only tool calls", () => {
    const run = buildRun([
      userLine("go"),
      assistantLine([
        toolUse("Grep", { pattern: "x" }),
        toolUse("Bash", { command: "grep -rn foo src | head" }),
        toolUse("Bash", { command: "rm -rf dist" }),
        toolUse("Bash", { command: "cat a > b" }),
        toolUse("Edit", { file_path: "/a", old_string: "a", new_string: "b" }),
      ]),
    ]);
    expect(run.turns[0].toolCalls.map(isReadOnlyCall)).toEqual([true, true, false, false, false]);
  });
});

describe("checkExpensiveSubagents", () => {
  it("passes runs without subagents", () => {
    expect(checkExpensiveSubagents(sampleRun("clean"))).toMatchObject({ status: "pass", summary: "No subagents in this run." });
  });

  it("warns for a read-only Opus subagent and estimates the cheaper cost", () => {
    const run = buildRun([userLine("task"), ...subagent("a", "claude-opus-5-5", [{ name: "Grep", input: { pattern: "csv" } }]), finalText("done")]);
    const result = checkExpensiveSubagents(run);
    expect(result.status).toBe("warn");
    expect(result.evidence[0].detail).toMatch(/on claude-haiku-5-5/);
  });

  it("does not flag cheap subagents or subagents that edit", () => {
    const run = buildRun([
      userLine("task"),
      ...subagent("a", "claude-haiku-5-5", [{ name: "Grep", input: { pattern: "x" } }]),
      ...subagent("b", "claude-opus-5-5", [{ name: "Read", input: { file_path: "/a" } }, { name: "Edit", input: { file_path: "/a", old_string: "a", new_string: "b" } }]),
      finalText("done"),
    ]);
    const result = checkExpensiveSubagents(run);
    expect(result.status).toBe("pass");
    expect(result.summary).toMatch(/2 subagents, none using an expensive model/);
  });

  it("fails the wasteful sample with three flagged subagents", () => {
    const result = checkExpensiveSubagents(sampleRun("wasteful"));
    expect(result.status).toBe("fail");
    expect(result.evidence).toHaveLength(3);
  });

  it("falls back to Task inputs when subagent transcripts are not inline", () => {
    const task = toolUse("Task", { description: "Find usages", prompt: "grep", subagent_type: "Explore", model: "opus" });
    const run = buildRun([userLine("go"), assistantLine([task]), userLine([toolResult(task.id, "found 3")]), finalText("done")]);
    expect(checkExpensiveSubagents(run).status).toBe("warn");
  });
});
