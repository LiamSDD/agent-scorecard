import Link from "next/link";
import type { CheckResult } from "@/lib/checks/types";
import type { HygieneScore } from "@/lib/checks/score";
import { formatUsd } from "@/lib/cost";
import { formatDuration, formatPercent } from "@/lib/format";
import type { SampleMeta } from "@/data/samples";
import type { Run } from "@/lib/transcript/types";

const GRADE_CLASS: Record<HygieneScore["grade"], string> = { good: "badge-pass", fair: "badge-warn", poor: "badge-fail" };

export function SampleCard({ meta, run, score, checks }: { meta: SampleMeta; run: Run; score: HygieneScore; checks: CheckResult[] }) {
  const fails = checks.filter((check) => check.status === "fail").length;
  const warns = checks.filter((check) => check.status === "warn").length;
  return (
    <li className="card relative flex flex-col p-4 hover:border-muted sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-caps">Sample · {meta.repo}</p>
          <h3 className="mt-1 text-[16px] font-semibold">
            <Link href={`/runs/${meta.id}`} className="text-text after:absolute after:inset-0 hover:underline">
              {meta.name}
            </Link>
          </h3>
        </div>
        <span className={`badge ${GRADE_CLASS[score.grade]} font-mono`} aria-label={`Hygiene score ${score.score} out of 100`}>
          {score.score}
        </span>
      </div>
      <p className="mt-2 flex-1 text-[14px] text-muted">{meta.blurb}</p>
      <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-border pt-3 text-[12px]">
        <div>
          <dt className="text-muted">Cost</dt>
          <dd className="font-mono">{formatUsd(run.totals.costUsd)}</dd>
        </div>
        <div>
          <dt className="text-muted">Turns</dt>
          <dd className="font-mono">{run.totals.turns}</dd>
        </div>
        <div>
          <dt className="text-muted">Cache</dt>
          <dd className="font-mono">{formatPercent(run.totals.cacheHitRate)}</dd>
        </div>
        <div>
          <dt className="text-muted">Time</dt>
          <dd className="font-mono">{formatDuration(run.totals.durationMs)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[12px] text-muted">
        {fails === 0 && warns === 0 ? "All checks pass" : `${fails} failed, ${warns} ${warns === 1 ? "warning" : "warnings"}`}
      </p>
    </li>
  );
}
