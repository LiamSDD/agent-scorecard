import { MAX_DISPLAY_TEXT_CHARS, MAX_INPUT_STRING_CHARS } from "../config";
import { addUsage, cacheHitRate, costForModel, emptyUsage } from "../cost";
import { oneLine, stripControl, truncate } from "../sanitize";
import { categorizeTool, describeToolTarget } from "./tools";
import type {
  ParseStats,
  Run,
  Subagent,
  TimelineItem,
  TokenUsage,
  ToolCall,
  Turn,
} from "./types";

export type TranscriptErrorCode = "empty" | "not_json" | "not_transcript";

export class TranscriptError extends Error {
  readonly code: TranscriptErrorCode;

  constructor(code: TranscriptErrorCode, message: string) {
    super(message);
    this.name = "TranscriptError";
    this.code = code;
  }
}

type JsonObject = Record<string, unknown>;

const MAX_LINE_CHARS = 10 * 1024 * 1024;
const MAX_RECORDED_MALFORMED = 50;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function cleanText(value: string, max = MAX_DISPLAY_TEXT_CHARS): string {
  return truncate(stripControl(value).trim(), max);
}

function sanitizeInput(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return truncate(stripControl(value), MAX_INPUT_STRING_CHARS);
  if (depth > 5) return null;
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitizeInput(item, depth + 1));
  if (isObject(value)) {
    const out: JsonObject = {};
    for (const [key, item] of Object.entries(value)) out[key] = sanitizeInput(item, depth + 1);
    return out;
  }
  return value;
}

export function readUsage(raw: unknown): TokenUsage {
  if (!isObject(raw)) return emptyUsage();
  const creationTotal = num(raw.cache_creation_input_tokens);
  const breakdown = isObject(raw.cache_creation) ? raw.cache_creation : null;
  const fiveMinute = breakdown ? num(breakdown.ephemeral_5m_input_tokens) : 0;
  const oneHour = breakdown ? num(breakdown.ephemeral_1h_input_tokens) : 0;
  const remainder = Math.max(0, creationTotal - fiveMinute - oneHour);
  return {
    input: num(raw.input_tokens),
    output: num(raw.output_tokens),
    cacheRead: num(raw.cache_read_input_tokens),
    cacheWrite5m: fiveMinute + remainder,
    cacheWrite1h: oneHour,
  };
}

function maxUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: Math.max(a.input, b.input),
    output: Math.max(a.output, b.output),
    cacheRead: Math.max(a.cacheRead, b.cacheRead),
    cacheWrite5m: Math.max(a.cacheWrite5m, b.cacheWrite5m),
    cacheWrite1h: Math.max(a.cacheWrite1h, b.cacheWrite1h),
  };
}

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!isObject(block)) return "";
        if (block.type === "text" && typeof block.text === "string") return block.text;
        if (block.type === "image") return "[image]";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function cleanPrompt(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("<local-command-stdout>") || trimmed.startsWith("<local-command-stderr>")) return null;
  if (trimmed.startsWith("Caveat: The messages below were generated")) return null;
  const command = /<command-name>([^<]*)<\/command-name>/.exec(trimmed);
  if (command) {
    const args = /<command-args>([^<]*)<\/command-args>/.exec(trimmed);
    return oneLine(`${command[1]} ${args?.[1] ?? ""}`);
  }
  return trimmed;
}

export class TranscriptBuilder {
  private turns: Turn[] = [];
  private turnByKey = new Map<string, Turn>();
  private seenBlocks = new Set<string>();
  private toolCalls = new Map<string, ToolCall>();
  private timeline: TimelineItem[] = [];
  private agentByUuid = new Map<string, string>();
  private agentOrder: string[] = [];
  private lastEntryAgent: string | null = null;
  private sessionId: string | null = null;
  private cwd: string | null = null;
  private firstTimestamp: number | null = null;
  private lastTimestamp: number | null = null;
  private conversationEntries = 0;
  private stats: ParseStats = {
    lines: 0,
    entries: 0,
    malformedLines: [],
    malformedCount: 0,
    ignoredEntries: 0,
    duplicateBlocks: 0,
  };

  pushLine(rawLine: string): void {
    this.stats.lines += 1;
    const lineNumber = this.stats.lines;
    const line = rawLine.trim();
    if (!line) return;
    if (line.length > MAX_LINE_CHARS) {
      this.recordMalformed(lineNumber);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.recordMalformed(lineNumber);
      return;
    }
    if (!isObject(parsed)) {
      this.recordMalformed(lineNumber);
      return;
    }
    this.stats.entries += 1;
    this.handleEntry(parsed, lineNumber);
  }

  private recordMalformed(lineNumber: number): void {
    this.stats.malformedCount += 1;
    if (this.stats.malformedLines.length < MAX_RECORDED_MALFORMED) {
      this.stats.malformedLines.push(lineNumber);
    }
  }

  private noteTimestamp(raw: unknown): string | null {
    const value = text(raw);
    if (!value) return null;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) return null;
    if (this.firstTimestamp === null || ms < this.firstTimestamp) this.firstTimestamp = ms;
    if (this.lastTimestamp === null || ms > this.lastTimestamp) this.lastTimestamp = ms;
    return value;
  }

  private resolveAgent(entry: JsonObject): string | null {
    const uuid = text(entry.uuid);
    if (entry.isSidechain !== true) {
      this.lastEntryAgent = null;
      return null;
    }
    let agent = text(entry.agentId);
    if (!agent) {
      const parent = text(entry.parentUuid);
      if (parent && this.agentByUuid.has(parent)) {
        agent = this.agentByUuid.get(parent) ?? null;
      } else if (!parent && !uuid && this.lastEntryAgent) {
        agent = this.lastEntryAgent;
      }
    }
    if (!agent) agent = `agent-${this.agentOrder.length + 1}`;
    if (!this.agentOrder.includes(agent)) this.agentOrder.push(agent);
    if (uuid) this.agentByUuid.set(uuid, agent);
    this.lastEntryAgent = agent;
    return agent;
  }

  private handleEntry(entry: JsonObject, lineNumber: number): void {
    const type = text(entry.type);
    if (!this.sessionId) this.sessionId = text(entry.sessionId);
    if (!this.cwd) this.cwd = text(entry.cwd);

    if (type === "summary") {
      const summary = text(entry.summary) ?? "Conversation compacted";
      this.timeline.push({
        kind: "compaction",
        id: `compaction-${lineNumber}`,
        text: cleanText(summary, 600),
        timestamp: null,
        line: lineNumber,
      });
      return;
    }
    if (type === "system") {
      const timestamp = this.noteTimestamp(entry.timestamp);
      if (entry.subtype === "compact_boundary") {
        this.timeline.push({
          kind: "compaction",
          id: `compaction-${lineNumber}`,
          text: "Context compacted",
          timestamp,
          line: lineNumber,
        });
      } else {
        this.stats.ignoredEntries += 1;
      }
      return;
    }
    if (type !== "user" && type !== "assistant") {
      this.stats.ignoredEntries += 1;
      return;
    }
    const message = entry.message;
    if (!isObject(message)) {
      this.stats.ignoredEntries += 1;
      return;
    }
    this.conversationEntries += 1;
    const timestamp = this.noteTimestamp(entry.timestamp);
    const agentId = this.resolveAgent(entry);
    if (type === "assistant") {
      this.handleAssistant(entry, message, agentId, timestamp, lineNumber);
    } else {
      this.handleUser(entry, message, agentId, timestamp, lineNumber);
    }
  }

  private handleAssistant(
    entry: JsonObject,
    message: JsonObject,
    agentId: string | null,
    timestamp: string | null,
    lineNumber: number,
  ): void {
    const messageId = text(message.id) ?? text(entry.uuid) ?? `line-${lineNumber}`;
    const key = `${messageId}:${text(entry.requestId) ?? ""}`;
    let turn = this.turnByKey.get(key);
    const usage = readUsage(message.usage);
    if (!turn) {
      turn = {
        index: this.turns.length,
        key,
        model: stripControl(text(message.model) ?? "unknown"),
        timestamp,
        agentId,
        text: "",
        hasThinking: false,
        toolCalls: [],
        usage,
        costUsd: null,
        priceSource: "unpriced",
        line: lineNumber,
      };
      this.turns.push(turn);
      this.turnByKey.set(key, turn);
      this.timeline.push({ kind: "turn", id: `turn-${turn.index}`, turnIndex: turn.index });
    } else {
      turn.usage = maxUsage(turn.usage, usage);
    }

    const content = Array.isArray(message.content)
      ? message.content
      : typeof message.content === "string"
        ? [{ type: "text", text: message.content }]
        : [];
    content.forEach((block: unknown, blockIndex: number) => {
      if (!isObject(block)) return;
      if (block.type === "tool_use") {
        const id = text(block.id) ?? `${key}-tool-${blockIndex}`;
        if (this.toolCalls.has(id)) {
          this.stats.duplicateBlocks += 1;
          return;
        }
        const name = stripControl(text(block.name) ?? "unknown");
        const input = isObject(block.input) ? (sanitizeInput(block.input) as JsonObject) : {};
        const call: ToolCall = {
          id,
          name,
          category: categorizeTool(name),
          target: describeToolTarget(name, input),
          input,
          result: null,
          turnIndex: turn.index,
        };
        this.toolCalls.set(id, call);
        turn.toolCalls.push(call);
        return;
      }
      if (block.type === "text" && typeof block.text === "string") {
        const cleaned = cleanText(block.text);
        if (!cleaned) return;
        const fingerprint = `${key}|text|${cleaned}`;
        if (this.seenBlocks.has(fingerprint)) {
          this.stats.duplicateBlocks += 1;
          return;
        }
        this.seenBlocks.add(fingerprint);
        turn.text = truncate(turn.text ? `${turn.text}\n\n${cleaned}` : cleaned, MAX_DISPLAY_TEXT_CHARS);
        return;
      }
      if (block.type === "thinking" || block.type === "redacted_thinking") {
        turn.hasThinking = true;
      }
    });
  }

  private handleUser(
    entry: JsonObject,
    message: JsonObject,
    agentId: string | null,
    timestamp: string | null,
    lineNumber: number,
  ): void {
    if (entry.isCompactSummary === true) {
      this.timeline.push({
        kind: "compaction",
        id: `compaction-${lineNumber}`,
        text: "Context compacted (summary injected)",
        timestamp,
        line: lineNumber,
      });
      return;
    }
    const promptParts: string[] = [];
    if (typeof message.content === "string") {
      promptParts.push(message.content);
    } else if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (!isObject(block)) continue;
        if (block.type === "tool_result") {
          this.attachResult(block);
        } else if (block.type === "text" && typeof block.text === "string") {
          promptParts.push(block.text);
        }
      }
    }
    if (entry.isMeta === true || promptParts.length === 0) return;
    const prompt = cleanPrompt(stripControl(promptParts.join("\n\n")));
    if (!prompt) return;
    this.timeline.push({
      kind: "prompt",
      id: `prompt-${lineNumber}`,
      text: truncate(prompt, MAX_DISPLAY_TEXT_CHARS),
      timestamp,
      agentId,
      line: lineNumber,
    });
  }

  private attachResult(block: JsonObject): void {
    const toolUseId = text(block.tool_use_id);
    if (!toolUseId) return;
    const call = this.toolCalls.get(toolUseId);
    if (!call || call.result) return;
    const raw = stripControl(toolResultText(block.content));
    call.result = {
      text: truncate(raw, MAX_DISPLAY_TEXT_CHARS),
      chars: raw.length,
      isError: block.is_error === true,
    };
  }

  build(id: string): Run {
    if (this.stats.entries === 0) {
      if (this.stats.malformedCount > 0) {
        throw new TranscriptError(
          "not_json",
          "None of the lines in this file are valid JSON. A Claude Code transcript is a .jsonl file with one JSON object per line.",
        );
      }
      throw new TranscriptError("empty", "This file is empty.");
    }
    if (this.conversationEntries === 0 || this.turns.length === 0) {
      throw new TranscriptError(
        "not_transcript",
        "This file is valid JSON but does not look like a Claude Code transcript: no user and assistant messages were found.",
      );
    }

    let usage = emptyUsage();
    let costUsd = 0;
    let unpricedTurns = 0;
    const models = new Set<string>();
    for (const turn of this.turns) {
      const cost = costForModel(turn.usage, turn.model);
      turn.costUsd = cost.costUsd;
      turn.priceSource = cost.source;
      usage = addUsage(usage, turn.usage);
      if (cost.costUsd === null) unpricedTurns += 1;
      else costUsd += cost.costUsd;
      if (!turn.model.startsWith("<") && turn.model !== "unknown") models.add(turn.model);
    }

    const agentCalls = this.turns
      .filter((turn) => turn.agentId === null)
      .flatMap((turn) => turn.toolCalls.filter((call) => call.category === "agent"));
    const subagents: Subagent[] = this.agentOrder.map((agentId, position) => {
      const agentTurns = this.turns.filter((turn) => turn.agentId === agentId);
      return {
        id: agentId,
        label: `Subagent ${position + 1}`,
        models: [...new Set(agentTurns.map((turn) => turn.model))],
        turnIndexes: agentTurns.map((turn) => turn.index),
        description: agentCalls[position]?.target ?? null,
      };
    });

    const mainPrompts = this.timeline.filter(
      (item): item is Extract<TimelineItem, { kind: "prompt" }> => item.kind === "prompt" && item.agentId === null,
    );
    const task = mainPrompts[0]?.text ?? "Untitled run";
    const mainTurnsWithText = this.turns.filter((turn) => turn.agentId === null && turn.text);
    const finalAnswer = mainTurnsWithText[mainTurnsWithText.length - 1]?.text ?? "";
    const toolCalls = this.turns.reduce((sum, turn) => sum + turn.toolCalls.length, 0);
    const durationMs =
      this.firstTimestamp !== null && this.lastTimestamp !== null ? this.lastTimestamp - this.firstTimestamp : null;

    return {
      id,
      title: truncate(oneLine(task), 90),
      sessionId: this.sessionId ? stripControl(this.sessionId) : null,
      cwd: this.cwd ? stripControl(this.cwd) : null,
      task,
      finalAnswer,
      models: [...models],
      startedAt: this.firstTimestamp !== null ? new Date(this.firstTimestamp).toISOString() : null,
      endedAt: this.lastTimestamp !== null ? new Date(this.lastTimestamp).toISOString() : null,
      turns: this.turns,
      timeline: this.timeline,
      subagents,
      totals: {
        turns: this.turns.length,
        mainTurns: this.turns.filter((turn) => turn.agentId === null).length,
        toolCalls,
        subagents: Math.max(subagents.length, agentCalls.length),
        usage,
        costUsd: unpricedTurns === this.turns.length ? null : costUsd,
        unpricedTurns,
        cacheHitRate: cacheHitRate(usage),
        durationMs,
        compactions: this.timeline.filter((item) => item.kind === "compaction").length,
      },
      stats: this.stats,
    };
  }
}

export function parseTranscript(content: string, id = "run"): Run {
  const builder = new TranscriptBuilder();
  for (const line of content.split("\n")) builder.pushLine(line);
  return builder.build(id);
}
