import type { Run } from "../transcript/types";
import { checkDestructiveCommands, DESTRUCTIVE_META } from "./destructive";
import { checkExpensiveSubagents, EXPENSIVE_SUBAGENTS_META } from "./expensive-subagents";
import { checkIgnoredFailures, IGNORED_FAILURES_META } from "./ignored-failures";
import { checkLongContext, LONG_CONTEXT_META } from "./long-context";
import { checkRepeatedReads, REPEATED_READS_META } from "./repeated-reads";
import { checkSecrets, SECRETS_META } from "./secrets";
import type { CheckMeta, CheckResult } from "./types";
import { checkUnverifiedEdits, UNVERIFIED_EDITS_META } from "./unverified-edits";

export const CHECKS: ((run: Run) => CheckResult)[] = [
  checkDestructiveCommands,
  checkSecrets,
  checkUnverifiedEdits,
  checkIgnoredFailures,
  checkRepeatedReads,
  checkLongContext,
  checkExpensiveSubagents,
];

export const CHECK_DEFINITIONS: CheckMeta[] = [
  DESTRUCTIVE_META,
  SECRETS_META,
  UNVERIFIED_EDITS_META,
  IGNORED_FAILURES_META,
  REPEATED_READS_META,
  LONG_CONTEXT_META,
  EXPENSIVE_SUBAGENTS_META,
];

export function runChecks(run: Run): CheckResult[] {
  return CHECKS.map((check) => check(run));
}

export type { CheckMeta, CheckResult, CheckStatus, CheckId, Evidence } from "./types";
