import { formatTokens } from "../cost";
import type { Run } from "../transcript/types";
import { allToolCalls, filePathOf } from "./helpers";
import { plural, type CheckMeta, type CheckResult, type CheckStatus, type Evidence } from "./types";

export const REPEATED_READ_THRESHOLDS = {
  warnRedundantPerFile: 2,
  failRedundantTotal: 8,
  failWastedTokens: 50_000,
};

const CHARS_PER_TOKEN = 4;

type FileReads = { path: string; redundant: number; wastedChars: number; turns: number[] };

export function findRedundantReads(run: Run): FileReads[] {
  const readsSinceChange = new Map<string, number>();
  const byPath = new Map<string, FileReads>();
  for (const call of allToolCalls(run)) {
    const path = filePathOf(call);
    if (!path) continue;
    if (call.category === "edit" || call.category === "write") {
      for (const key of readsSinceChange.keys()) {
        if (key.startsWith(`${path}|`)) readsSinceChange.delete(key);
      }
      continue;
    }
    if (call.category !== "read") continue;
    const key = `${path}|${String(call.input.offset ?? "")}|${String(call.input.limit ?? "")}`;
    const previous = readsSinceChange.get(key) ?? 0;
    readsSinceChange.set(key, previous + 1);
    if (previous === 0) continue;
    const entry = byPath.get(path) ?? { path, redundant: 0, wastedChars: 0, turns: [] };
    entry.redundant += 1;
    entry.wastedChars += call.result?.chars ?? 0;
    entry.turns.push(call.turnIndex);
    byPath.set(path, entry);
  }
  return [...byPath.values()].sort((a, b) => b.wastedChars - a.wastedChars);
}

export const REPEATED_READS_META: CheckMeta = {
  id: "repeated-reads",
  title: "Files read repeatedly",
  description:
    "Counts reads of the same file and range when the file has not changed since the last read. Each one re-sends the content as tokens.",
  weight: 8,
};

export function checkRepeatedReads(run: Run): CheckResult {
  const files = findRedundantReads(run);
  const redundantTotal = files.reduce((sum, file) => sum + file.redundant, 0);
  const wastedTokens = Math.round(files.reduce((sum, file) => sum + file.wastedChars, 0) / CHARS_PER_TOKEN);
  const flagged = files.filter((file) => file.redundant >= REPEATED_READ_THRESHOLDS.warnRedundantPerFile);
  let status: CheckStatus = "pass";
  if (
    redundantTotal >= REPEATED_READ_THRESHOLDS.failRedundantTotal ||
    wastedTokens >= REPEATED_READ_THRESHOLDS.failWastedTokens
  ) {
    status = "fail";
  } else if (flagged.length > 0) {
    status = "warn";
  }
  const evidence: Evidence[] = files.flatMap((file) =>
    file.turns.map((turnIndex, position) => ({
      turnIndex,
      label: `Re-read of ${file.path}, unchanged since the last read (repeat ${position + 1})`,
      detail: `${file.redundant} redundant reads, about ${formatTokens(Math.round(file.wastedChars / CHARS_PER_TOKEN))} tokens`,
      severity: status,
    })),
  );
  return {
    ...REPEATED_READS_META,
    status,
    summary:
      redundantTotal === 0
        ? "No file was re-read without changing in between."
        : `${plural(redundantTotal, "redundant read")} across ${plural(files.length, "file")}, roughly ${formatTokens(wastedTokens)} tokens of repeated content.`,
    evidence,
  };
}
