export type TokenUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
};

export type ToolCategory =
  | "read"
  | "edit"
  | "write"
  | "bash"
  | "search"
  | "agent"
  | "web"
  | "todo"
  | "other";

export type ToolResult = {
  text: string;
  chars: number;
  isError: boolean;
};

export type ToolCall = {
  id: string;
  name: string;
  category: ToolCategory;
  target: string;
  input: Record<string, unknown>;
  result: ToolResult | null;
  turnIndex: number;
};

export type Turn = {
  index: number;
  key: string;
  model: string;
  timestamp: string | null;
  agentId: string | null;
  text: string;
  hasThinking: boolean;
  toolCalls: ToolCall[];
  usage: TokenUsage;
  costUsd: number | null;
  priceSource: "exact" | "family" | "unpriced";
  line: number;
};

export type TimelineItem =
  | { kind: "prompt"; id: string; text: string; timestamp: string | null; agentId: string | null; line: number }
  | { kind: "turn"; id: string; turnIndex: number }
  | { kind: "compaction"; id: string; text: string; timestamp: string | null; line: number };

export type Subagent = {
  id: string;
  label: string;
  models: string[];
  turnIndexes: number[];
  description: string | null;
};

export type RunTotals = {
  turns: number;
  mainTurns: number;
  toolCalls: number;
  subagents: number;
  usage: TokenUsage;
  costUsd: number | null;
  unpricedTurns: number;
  cacheHitRate: number | null;
  durationMs: number | null;
  compactions: number;
};

export type ParseStats = {
  lines: number;
  entries: number;
  malformedLines: number[];
  malformedCount: number;
  ignoredEntries: number;
  duplicateBlocks: number;
};

export type Run = {
  id: string;
  title: string;
  sessionId: string | null;
  cwd: string | null;
  task: string;
  finalAnswer: string;
  models: string[];
  startedAt: string | null;
  endedAt: string | null;
  turns: Turn[];
  timeline: TimelineItem[];
  subagents: Subagent[];
  totals: RunTotals;
  stats: ParseStats;
};
