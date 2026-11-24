export type CheckStatus = "pass" | "warn" | "fail";

export type CheckId =
  | "destructive-commands"
  | "secrets"
  | "unverified-edits"
  | "ignored-failures"
  | "repeated-reads"
  | "long-context"
  | "expensive-subagents";

export type Evidence = {
  turnIndex: number;
  label: string;
  detail?: string;
  severity: CheckStatus;
};

export type CheckResult = {
  id: CheckId;
  title: string;
  description: string;
  status: CheckStatus;
  summary: string;
  evidence: Evidence[];
  weight: number;
};

export function worstStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export type CheckMeta = Pick<CheckResult, "id" | "title" | "description" | "weight">;
