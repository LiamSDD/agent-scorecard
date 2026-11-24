import type { Run, ToolCall } from "../transcript/types";
import { allToolCalls, redact } from "./helpers";
import { plural, worstStatus, type CheckMeta, type CheckResult, type CheckStatus, type Evidence } from "./types";

type SecretPattern = { label: string; regex: RegExp; severity: CheckStatus; group?: number };

export const SECRET_PATTERNS: SecretPattern[] = [
  { label: "Anthropic API key", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, severity: "fail" },
  { label: "OpenAI API key", regex: /\bsk-(?:proj-)?(?!ant-)[A-Za-z0-9_-]{32,}/g, severity: "fail" },
  { label: "AWS access key ID", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, severity: "fail" },
  { label: "GitHub token", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/g, severity: "fail" },
  { label: "Slack token", regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, severity: "fail" },
  { label: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g, severity: "fail" },
  { label: "Stripe secret key", regex: /\b[sr]k_live_[0-9a-zA-Z]{20,}/g, severity: "fail" },
  { label: "Private key block", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g, severity: "fail" },
  {
    label: "Hard-coded credential assignment",
    regex: /\b(?:api[_-]?key|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|password|passwd)\b["']?\s*[:=]\s*["']([A-Za-z0-9_\-/+=]{16,})["']/gi,
    severity: "warn",
    group: 1,
  },
];

export function findSecrets(value: string): { label: string; match: string; severity: CheckStatus }[] {
  const found: { label: string; match: string; severity: CheckStatus }[] = [];
  const seen = new Set<string>();
  for (const pattern of SECRET_PATTERNS) {
    for (const hit of value.matchAll(pattern.regex)) {
      const match = hit[pattern.group ?? 0] ?? hit[0];
      if (seen.has(match) || [...seen].some((existing) => existing.includes(match) || match.includes(existing))) continue;
      seen.add(match);
      found.push({ label: pattern.label, match, severity: pattern.severity });
    }
  }
  return found;
}

function scannableText(call: ToolCall): { where: string; value: string }[] {
  const input = call.input;
  const out: { where: string; value: string }[] = [];
  const push = (where: string, value: unknown) => {
    if (typeof value === "string" && value) out.push({ where, value });
  };
  if (call.name === "Bash") push("Bash command", input.command);
  if (call.name === "Write") push(`file written to ${String(input.file_path ?? "")}`, input.content);
  if (call.name === "Edit") push(`edit to ${String(input.file_path ?? "")}`, input.new_string);
  if (call.name === "NotebookEdit") push(`notebook edit to ${String(input.notebook_path ?? "")}`, input.new_source);
  if (call.name === "MultiEdit" && Array.isArray(input.edits)) {
    for (const edit of input.edits) {
      if (edit && typeof edit === "object") {
        push(`edit to ${String(input.file_path ?? "")}`, (edit as Record<string, unknown>).new_string);
      }
    }
  }
  return out;
}

export const SECRETS_META: CheckMeta = {
  id: "secrets",
  title: "Possible secrets",
  description:
    "Scans shell commands, written files and edits for common key formats (Anthropic, OpenAI, AWS, GitHub, Slack, Google, Stripe, private keys) and hard-coded credentials.",
  weight: 25,
};

export function checkSecrets(run: Run): CheckResult {
  const evidence: Evidence[] = [];
  for (const call of allToolCalls(run)) {
    for (const source of scannableText(call)) {
      for (const hit of findSecrets(source.value)) {
        evidence.push({
          turnIndex: call.turnIndex,
          label: `${hit.label} in ${source.where}`,
          detail: redact(hit.match),
          severity: hit.severity,
        });
      }
    }
  }
  const status = worstStatus(evidence.map((item) => item.severity));
  return {
    ...SECRETS_META,
    status,
    summary:
      evidence.length === 0
        ? "No key-like strings in commands, written files or edits."
        : `${plural(evidence.length, "possible secret")} found. Values are redacted here and in the AI review summary.`,
    evidence,
  };
}

export function redactSecrets(value: string): string {
  let out = value;
  for (const hit of findSecrets(value)) {
    out = out.split(hit.match).join("[REDACTED]");
  }
  return out;
}
