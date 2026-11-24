import type { CheckResult, CheckStatus } from "./types";

export const STATUS_PENALTY: Record<CheckStatus, number> = { pass: 0, warn: 0.5, fail: 1 };

export type ScoreLine = { id: string; title: string; status: CheckStatus; weight: number; deduction: number };
export type HygieneScore = { score: number; max: number; lines: ScoreLine[]; grade: "good" | "fair" | "poor" };

export function computeHygieneScore(results: CheckResult[]): HygieneScore {
  const max = results.reduce((sum, result) => sum + result.weight, 0);
  const lines = results.map((result) => ({
    id: result.id,
    title: result.title,
    status: result.status,
    weight: result.weight,
    deduction: result.weight * STATUS_PENALTY[result.status],
  }));
  const lost = lines.reduce((sum, line) => sum + line.deduction, 0);
  const score = max === 0 ? 100 : Math.max(0, Math.round(((max - lost) / max) * 100));
  return { score, max, lines, grade: score >= 85 ? "good" : score >= 60 ? "fair" : "poor" };
}
