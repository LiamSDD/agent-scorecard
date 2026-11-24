import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTranscript } from "@/lib/transcript/parse";
import type { Run } from "@/lib/transcript/types";

export function sampleText(id: "clean" | "risky" | "wasteful"): string {
  return readFileSync(join(process.cwd(), "src/data/samples", `${id}.jsonl`), "utf8");
}

export function sampleRun(id: "clean" | "risky" | "wasteful"): Run {
  return parseTranscript(sampleText(id), id);
}

let counter = 0;

export type LineOptions = {
  sidechain?: boolean;
  model?: string;
  messageId?: string;
  requestId?: string;
  usage?: Record<string, unknown>;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
};

export function userLine(content: unknown, options: LineOptions & { isMeta?: boolean } = {}): string {
  counter += 1;
  return JSON.stringify({
    type: "user",
    isSidechain: options.sidechain ?? false,
    uuid: options.uuid ?? `u-${counter}`,
    parentUuid: options.parentUuid ?? null,
    timestamp: options.timestamp ?? new Date(Date.UTC(2026, 0, 1, 0, 0, counter)).toISOString(),
    sessionId: "session-test",
    cwd: "/home/dev/project",
    ...(options.isMeta ? { isMeta: true } : {}),
    message: { role: "user", content },
  });
}

export function assistantLine(content: unknown[], options: LineOptions = {}): string {
  counter += 1;
  return JSON.stringify({
    type: "assistant",
    isSidechain: options.sidechain ?? false,
    uuid: options.uuid ?? `a-${counter}`,
    parentUuid: options.parentUuid ?? null,
    timestamp: options.timestamp ?? new Date(Date.UTC(2026, 0, 1, 0, 0, counter)).toISOString(),
    requestId: options.requestId ?? `req-${counter}`,
    message: {
      id: options.messageId ?? `msg-${counter}`,
      role: "assistant",
      model: options.model ?? "claude-sonnet-5-5",
      content,
      usage: options.usage ?? { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  });
}

export function toolUse(name: string, input: Record<string, unknown>, id?: string) {
  counter += 1;
  return { type: "tool_use", id: id ?? `toolu-${counter}`, name, input };
}

export function toolResult(toolUseId: string, content: string, isError = false) {
  return { type: "tool_result", tool_use_id: toolUseId, content, is_error: isError };
}

export function bashStep(command: string, output: string, isError = false, options: LineOptions = {}): string[] {
  const call = toolUse("Bash", { command });
  return [assistantLine([call], options), userLine([toolResult(call.id, output, isError)], { sidechain: options.sidechain })];
}

export function editStep(filePath: string, options: LineOptions = {}): string[] {
  const call = toolUse("Edit", { file_path: filePath, old_string: "a", new_string: "b" });
  return [assistantLine([call], options), userLine([toolResult(call.id, "updated")], { sidechain: options.sidechain })];
}

export function readStep(filePath: string, output = "content", options: LineOptions = {}): string[] {
  const call = toolUse("Read", { file_path: filePath });
  return [assistantLine([call], options), userLine([toolResult(call.id, output)], { sidechain: options.sidechain })];
}

export function finalText(text: string, options: LineOptions = {}): string {
  return assistantLine([{ type: "text", text }], options);
}

export function buildRun(lines: string[], id = "test"): Run {
  return parseTranscript(lines.join("\n"), id);
}
