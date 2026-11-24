import type { Run, TimelineItem, ToolCall, Turn } from "../transcript/types";

export function allToolCalls(run: Run): ToolCall[] {
  return run.turns.flatMap((turn) => turn.toolCalls);
}

export function bashCommand(call: ToolCall): string | null {
  if (call.name !== "Bash") return null;
  return typeof call.input.command === "string" ? call.input.command : null;
}

export function filePathOf(call: ToolCall): string | null {
  const value = call.input.file_path ?? call.input.notebook_path;
  return typeof value === "string" ? value : null;
}

export type PromptSegment = {
  prompt: Extract<TimelineItem, { kind: "prompt" }> | null;
  turns: Turn[];
};

export function segmentByPrompt(run: Run): PromptSegment[] {
  const segments: PromptSegment[] = [];
  let current: PromptSegment = { prompt: null, turns: [] };
  for (const item of run.timeline) {
    if (item.kind === "prompt" && item.agentId === null) {
      if (current.prompt || current.turns.length > 0) segments.push(current);
      current = { prompt: item, turns: [] };
    } else if (item.kind === "turn") {
      const turn = run.turns[item.turnIndex];
      if (turn) current.turns.push(turn);
    }
  }
  if (current.prompt || current.turns.length > 0) segments.push(current);
  return segments;
}

const RUNNER_PREFIXES = new Set([
  "npm", "pnpm", "yarn", "npx", "bun", "bunx", "python", "python3", "go", "cargo", "make", "uv", "poetry", "dotnet",
  "git", "docker", "kubectl", "gh", "terraform",
]);

export function commandSignature(command: string): string {
  const lastSegment = command
    .split(/&&|;|\|\|/)
    .map((part) => part.trim())
    .filter((part) => part && !/^cd\s/.test(part))
    .pop() ?? command.trim();
  const tokens = lastSegment
    .split(/\s+/)
    .filter((token) => token && !/^[A-Z_][A-Z0-9_]*=/.test(token));
  if (tokens.length === 0) return "";
  const first = tokens[0];
  if (!RUNNER_PREFIXES.has(first)) return first;
  if (tokens[1] === "run" || tokens[1] === "-m") return tokens.slice(0, 3).join(" ");
  return tokens.slice(0, 2).join(" ");
}

export function redact(secret: string): string {
  const visible = secret.slice(0, Math.min(7, Math.floor(secret.length / 3)));
  return `${visible}… (${secret.length} chars, redacted)`;
}
