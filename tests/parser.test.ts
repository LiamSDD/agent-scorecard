import { describe, expect, it } from "vitest";
import { parseTranscript, readUsage, TranscriptError } from "@/lib/transcript/parse";
import { stripControl } from "@/lib/sanitize";
import { assistantLine, buildRun, sampleRun, toolResult, toolUse, userLine } from "./helpers";

const USAGE = {
  input_tokens: 100,
  output_tokens: 50,
  cache_read_input_tokens: 1000,
  cache_creation_input_tokens: 200,
};

describe("parseTranscript: structure", () => {
  it("parses the clean sample into turns, prompts and totals", () => {
    const run = sampleRun("clean");
    expect(run.turns).toHaveLength(16);
    expect(run.models).toEqual(["claude-sonnet-5-5"]);
    expect(run.task).toMatch(/^Customers with a 15% discount code/);
    expect(run.finalAnswer).toMatch(/Ready for the PR/);
    expect(run.sessionId).toBeTruthy();
    expect(run.cwd).toBe("/home/dev/shop-api");
    expect(run.totals.toolCalls).toBe(14);
    expect(run.stats.malformedCount).toBe(0);
  });

  it("uses the first main-thread prompt as the task and the last main-thread text as the final answer", () => {
    const run = buildRun([
      userLine("First request"),
      assistantLine([{ type: "text", text: "Working on it" }]),
      userLine("Second request"),
      assistantLine([{ type: "text", text: "All finished" }]),
    ]);
    expect(run.task).toBe("First request");
    expect(run.finalAnswer).toBe("All finished");
    expect(run.timeline.filter((item) => item.kind === "prompt")).toHaveLength(2);
  });

  it("accepts string assistant content", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { id: "m1", role: "assistant", model: "claude-sonnet-5-5", content: "plain string reply", usage: USAGE },
    });
    const run = parseTranscript([userLine("hi"), line].join("\n"));
    expect(run.turns[0].text).toBe("plain string reply");
  });

  it("handles CRLF line endings", () => {
    const run = parseTranscript([userLine("hi"), assistantLine([{ type: "text", text: "ok" }])].join("\r\n"));
    expect(run.turns).toHaveLength(1);
    expect(run.stats.malformedCount).toBe(0);
  });

  it("computes duration from the earliest and latest timestamps", () => {
    const run = buildRun([
      userLine("go", { timestamp: "2026-01-01T10:00:00.000Z" }),
      assistantLine([{ type: "text", text: "done" }], { timestamp: "2026-01-01T10:02:30.000Z" }),
    ]);
    expect(run.totals.durationMs).toBe(150_000);
    expect(run.startedAt).toBe("2026-01-01T10:00:00.000Z");
  });
});

describe("parseTranscript: usage deduplication", () => {
  it("counts usage once per message.id and requestId even when split across lines", () => {
    const shared = { messageId: "msg_same", requestId: "req_same", usage: USAGE };
    const run = buildRun([
      userLine("do it"),
      assistantLine([{ type: "text", text: "Reading" }], shared),
      assistantLine([toolUse("Read", { file_path: "/a.ts" })], shared),
      assistantLine([toolUse("Read", { file_path: "/b.ts" })], shared),
    ]);
    expect(run.turns).toHaveLength(1);
    expect(run.turns[0].toolCalls).toHaveLength(2);
    expect(run.totals.usage.input).toBe(100);
    expect(run.totals.usage.output).toBe(50);
    expect(run.totals.usage.cacheRead).toBe(1000);
  });

  it("keeps the largest value per field when streamed lines report partial usage", () => {
    const run = buildRun([
      userLine("go"),
      assistantLine([{ type: "text", text: "a" }], { messageId: "m", requestId: "r", usage: { ...USAGE, output_tokens: 3 } }),
      assistantLine([{ type: "text", text: "b" }], { messageId: "m", requestId: "r", usage: { ...USAGE, output_tokens: 90 } }),
    ]);
    expect(run.totals.usage.output).toBe(90);
  });

  it("treats the same message id with a different request id as a separate API call", () => {
    const run = buildRun([
      userLine("go"),
      assistantLine([{ type: "text", text: "a" }], { messageId: "m", requestId: "r1", usage: USAGE }),
      assistantLine([{ type: "text", text: "b" }], { messageId: "m", requestId: "r2", usage: USAGE }),
    ]);
    expect(run.turns).toHaveLength(2);
    expect(run.totals.usage.input).toBe(200);
  });

  it("drops duplicated text and tool_use blocks repeated on later lines", () => {
    const call = toolUse("Bash", { command: "ls" }, "toolu_dup");
    const run = buildRun([
      userLine("go"),
      assistantLine([{ type: "text", text: "same text" }, call], { messageId: "m", requestId: "r" }),
      assistantLine([{ type: "text", text: "same text" }, call], { messageId: "m", requestId: "r" }),
    ]);
    expect(run.turns[0].text).toBe("same text");
    expect(run.turns[0].toolCalls).toHaveLength(1);
    expect(run.stats.duplicateBlocks).toBe(2);
  });

  it("splits cache writes into 5 minute and 1 hour buckets, putting any remainder in 5 minute", () => {
    expect(
      readUsage({
        input_tokens: 1,
        cache_creation_input_tokens: 1000,
        cache_creation: { ephemeral_5m_input_tokens: 300, ephemeral_1h_input_tokens: 500 },
      }),
    ).toEqual({ input: 1, output: 0, cacheRead: 0, cacheWrite5m: 500, cacheWrite1h: 500 });
    expect(readUsage({ cache_creation_input_tokens: 400 }).cacheWrite5m).toBe(400);
    expect(readUsage(null)).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 });
    expect(readUsage({ input_tokens: -5, output_tokens: "7" }).input).toBe(0);
  });
});

describe("parseTranscript: malformed and non-transcript input", () => {
  it("skips malformed lines and records their line numbers", () => {
    const run = parseTranscript(
      [userLine("go"), "{not json", assistantLine([{ type: "text", text: "ok" }]), "42", "[1,2]", ""].join("\n"),
    );
    expect(run.turns).toHaveLength(1);
    expect(run.stats.malformedCount).toBe(3);
    expect(run.stats.malformedLines).toEqual([2, 4, 5]);
  });

  it("throws not_json when no line is valid JSON", () => {
    expect(() => parseTranscript("hello\nworld")).toThrowError(TranscriptError);
    try {
      parseTranscript("hello\nworld");
    } catch (error) {
      expect((error as TranscriptError).code).toBe("not_json");
    }
  });

  it("throws empty for an empty file", () => {
    expect(() => parseTranscript("\n\n")).toThrow(/empty/);
  });

  it("throws not_transcript for valid JSON lines that are not Claude Code entries", () => {
    try {
      parseTranscript('{"name":"package","version":"1.0.0"}\n{"foo":1}');
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(TranscriptError);
      expect((error as TranscriptError).code).toBe("not_transcript");
    }
  });

  it("throws not_transcript when there are user lines but no assistant turns", () => {
    expect(() => parseTranscript(userLine("only a prompt"))).toThrow(/does not look like a Claude Code transcript/);
  });

  it("ignores unknown entry types such as file-history snapshots", () => {
    const run = parseTranscript(
      [JSON.stringify({ type: "file-history-snapshot", snapshot: {} }), userLine("go"), assistantLine([{ type: "text", text: "ok" }])].join("\n"),
    );
    expect(run.stats.ignoredEntries).toBe(1);
  });
});

describe("parseTranscript: subagents", () => {
  it("groups sidechain entries into subagents by parentUuid chain", () => {
    const run = buildRun([
      userLine("main task"),
      assistantLine([toolUse("Task", { description: "Explore auth", subagent_type: "Explore" })]),
      userLine("sub prompt one", { sidechain: true, uuid: "s1", parentUuid: null }),
      assistantLine([{ type: "text", text: "a1" }], { sidechain: true, uuid: "s2", parentUuid: "s1", model: "claude-haiku-5-5" }),
      userLine("sub prompt two", { sidechain: true, uuid: "t1", parentUuid: null }),
      assistantLine([{ type: "text", text: "b1" }], { sidechain: true, uuid: "t2", parentUuid: "t1" }),
      assistantLine([{ type: "text", text: "b2" }], { sidechain: true, uuid: "t3", parentUuid: "t2" }),
      assistantLine([{ type: "text", text: "main done" }]),
    ]);
    expect(run.subagents).toHaveLength(2);
    expect(run.subagents[0]).toMatchObject({ label: "Subagent 1", models: ["claude-haiku-5-5"], description: "Explore auth (Explore)" });
    expect(run.subagents[1].turnIndexes).toHaveLength(2);
    expect(run.totals.subagents).toBe(2);
    expect(run.totals.mainTurns).toBe(2);
  });

  it("does not treat sidechain prompts as the task or the final answer", () => {
    const run = buildRun([
      userLine("real task"),
      userLine("subagent instructions", { sidechain: true, uuid: "x", parentUuid: null }),
      assistantLine([{ type: "text", text: "subagent report" }], { sidechain: true, uuid: "y", parentUuid: "x" }),
      assistantLine([{ type: "text", text: "main answer" }]),
    ]);
    expect(run.task).toBe("real task");
    expect(run.finalAnswer).toBe("main answer");
  });

  it("finds three Opus subagents in the wasteful sample", () => {
    const run = sampleRun("wasteful");
    expect(run.subagents).toHaveLength(3);
    expect(run.subagents.every((agent) => agent.models.includes("claude-opus-5-5"))).toBe(true);
  });
});

describe("parseTranscript: sanitising", () => {
  it("strips ANSI escapes and control characters from text, commands and results", () => {
    const call = toolUse("Bash", { command: "npm test \u001b[31mred\u001b[0m" });
    const run = buildRun([
      userLine("go \u001b]0;title\u0007now"),
      assistantLine([{ type: "text", text: "\u001b[1mBold\u001b[22m text\u0000" }, call]),
      userLine([toolResult(call.id, "\u001b[32m PASS \u001b[39m all good\u0008")]),
    ]);
    expect(run.task).toBe("go now");
    expect(run.turns[0].text).toBe("Bold text");
    expect(run.turns[0].toolCalls[0].target).toBe("npm test red");
    expect(run.turns[0].toolCalls[0].result?.text).toBe(" PASS  all good");
  });

  it("stripControl keeps newlines and tabs and normalises carriage returns", () => {
    expect(stripControl("a\tb\r\nc\rd\u001b[2K")).toBe("a\tb\nc\nd");
  });

  it("attaches tool results with error flags and full character counts", () => {
    const call = toolUse("Bash", { command: "npm test" });
    const run = buildRun([
      userLine("go"),
      assistantLine([call]),
      userLine([{ type: "tool_result", tool_use_id: call.id, content: [{ type: "text", text: "boom" }, { type: "image" }], is_error: true }]),
    ]);
    expect(run.turns[0].toolCalls[0].result).toEqual({ text: "boom\n[image]", chars: 12, isError: true });
  });

  it("records compaction from summary entries and compact boundaries", () => {
    const run = buildRun([
      JSON.stringify({ type: "summary", summary: "Earlier work on auth", leafUuid: "x" }),
      userLine("continue"),
      assistantLine([{ type: "text", text: "ok" }]),
      JSON.stringify({ type: "system", subtype: "compact_boundary", timestamp: "2026-01-01T00:10:00Z" }),
    ]);
    expect(run.totals.compactions).toBe(2);
  });

  it("skips meta prompts and turns slash commands into readable prompts", () => {
    const run = buildRun([
      userLine("Caveat: The messages below were generated by the user while running local commands.", { isMeta: true }),
      userLine("<command-name>/review</command-name>\n<command-message>review</command-message>\n<command-args>src/</command-args>"),
      userLine("<local-command-stdout>output</local-command-stdout>"),
      assistantLine([{ type: "text", text: "ok" }]),
    ]);
    const prompts = run.timeline.filter((item) => item.kind === "prompt");
    expect(prompts).toHaveLength(1);
    expect(run.task).toBe("/review src/");
  });
});

describe("parseTranscript: pricing on parse", () => {
  it("marks unknown models as unpriced and never as zero cost", () => {
    const run = buildRun([userLine("go"), assistantLine([{ type: "text", text: "ok" }], { model: "gpt-9", usage: USAGE })]);
    expect(run.turns[0].costUsd).toBeNull();
    expect(run.turns[0].priceSource).toBe("unpriced");
    expect(run.totals.costUsd).toBeNull();
    expect(run.totals.unpricedTurns).toBe(1);
  });

  it("sums priced turns and counts unpriced ones separately", () => {
    const run = buildRun([
      userLine("go"),
      assistantLine([{ type: "text", text: "a" }], { model: "claude-opus-5-5", usage: { input_tokens: 1_000_000 } }),
      assistantLine([{ type: "text", text: "b" }], { model: "mystery-model", usage: { input_tokens: 1_000_000 } }),
    ]);
    expect(run.totals.costUsd).toBeCloseTo(4);
    expect(run.totals.unpricedTurns).toBe(1);
  });
});
