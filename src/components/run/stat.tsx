import type { ReactNode } from "react";

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="label-caps">{label}</dt>
      <dd className="stat-value mt-0.5 truncate" title={hint}>
        {value}
      </dd>
      {hint ? <dd className="mt-0.5 truncate text-[12px] text-muted">{hint}</dd> : null}
    </div>
  );
}
