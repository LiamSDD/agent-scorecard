import { oneLine, truncate } from "../sanitize";
import type { ToolCategory } from "./types";

const CATEGORY_BY_NAME: Record<string, ToolCategory> = {
  Read: "read",
  NotebookRead: "read",
  Edit: "edit",
  MultiEdit: "edit",
  NotebookEdit: "edit",
  Write: "write",
  Bash: "bash",
  BashOutput: "bash",
  KillShell: "bash",
  Grep: "search",
  Glob: "search",
  LS: "search",
  Task: "agent",
  Agent: "agent",
  WebFetch: "web",
  WebSearch: "web",
  TodoWrite: "todo",
};

export function categorizeTool(name: string): ToolCategory {
  return CATEGORY_BY_NAME[name] ?? "other";
}

export const TOOL_FILTERS: { id: ToolCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "read", label: "Read" },
  { id: "edit", label: "Edit" },
  { id: "write", label: "Write" },
  { id: "bash", label: "Bash" },
  { id: "search", label: "Grep / Glob" },
  { id: "agent", label: "Task / Agent" },
  { id: "web", label: "Web" },
  { id: "todo", label: "Todo" },
  { id: "other", label: "Other" },
];

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function describeToolTarget(name: string, input: Record<string, unknown>): string {
  const filePath = str(input.file_path) ?? str(input.notebook_path) ?? str(input.path);
  switch (categorizeTool(name)) {
    case "read": {
      if (!filePath) return name;
      const offset = typeof input.offset === "number" ? input.offset : null;
      const limit = typeof input.limit === "number" ? input.limit : null;
      if (offset === null && limit === null) return filePath;
      return `${filePath} (lines ${offset ?? 1}${limit !== null ? `+${limit}` : ""})`;
    }
    case "edit":
    case "write":
      return filePath ?? name;
    case "bash":
      return str(input.command) ?? str(input.bash_id) ?? str(input.shell_id) ?? name;
    case "search": {
      const pattern = str(input.pattern) ?? "";
      const where = str(input.path) ?? str(input.glob) ?? "";
      return truncate(oneLine([pattern, where].filter(Boolean).join("  in  ")), 240) || name;
    }
    case "agent": {
      const description = str(input.description) ?? str(input.prompt) ?? name;
      const kind = str(input.subagent_type);
      return truncate(oneLine(kind ? `${description} (${kind})` : description), 240);
    }
    case "web":
      return str(input.url) ?? str(input.query) ?? name;
    case "todo":
      return Array.isArray(input.todos) ? `${input.todos.length} items` : "todos";
    default: {
      const firstString = Object.values(input).find((value) => typeof value === "string");
      return typeof firstString === "string" ? truncate(oneLine(firstString), 240) : name;
    }
  }
}
