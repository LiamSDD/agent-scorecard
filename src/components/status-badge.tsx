import type { CheckStatus } from "@/lib/checks/types";

const LABEL: Record<CheckStatus, string> = { pass: "Pass", warn: "Warn", fail: "Fail" };

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2.5 6.5l2.2 2.2L9.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "warn") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M6 2.5v4.2M6 9.1v.1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3.2 3.2l5.6 5.6M8.8 3.2L3.2 8.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function StatusBadge({ status }: { status: CheckStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      <StatusIcon status={status} />
      {LABEL[status]}
    </span>
  );
}
