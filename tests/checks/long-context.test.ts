import { describe, expect, it } from "vitest";
import { checkLongContext } from "@/lib/checks/long-context";
import { assistantLine, buildRun, finalText, sampleRun, userLine } from "../helpers";

const contextTurn = (tokens: number) =>
  assistantLine([{ type: "text", text: "working" }], {
    usage: { input_tokens: 10, cache_read_input_tokens: tokens - 10, cache_creation_input_tokens: 0, output_tokens: 5 },
  });

describe("checkLongContext", () => {
  it("passes short runs and reports the peak", () => {
    const result = checkLongContext(sampleRun("clean"));
    expect(result.status).toBe("pass");
    expect(result.summary).toMatch(/^Peak context .* at T\d+; well within limits\.$/);
  });

  it("warns above 120k tokens of context", () => {
    const result = checkLongContext(buildRun([userLine("go"), contextTurn(50_000), contextTurn(130_000)]));
    expect(result.status).toBe("warn");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].turnIndex).toBe(1);
  });

  it("fails above 180k tokens when the run never compacted", () => {
    expect(checkLongContext(buildRun([userLine("go"), contextTurn(190_000)])).status).toBe("fail");
  });

  it("only warns above 180k tokens if the run did compact", () => {
    const run = buildRun([JSON.stringify({ type: "summary", summary: "earlier" }), userLine("go"), contextTurn(190_000)]);
    expect(checkLongContext(run).status).toBe("warn");
  });

  it("warns when one request takes 50 or more API calls", () => {
    const lines = [userLine("big task"), ...Array.from({ length: 50 }, () => contextTurn(20_000)), finalText("done")];
    const result = checkLongContext(buildRun(lines));
    expect(result.status).toBe("warn");
    expect(result.evidence[0].label).toMatch(/API calls for a single request/);
  });

  it("warns on the wasteful sample", () => {
    const result = checkLongContext(sampleRun("wasteful"));
    expect(result.status).toBe("warn");
    expect(result.summary).toMatch(/no compaction/);
  });
});
