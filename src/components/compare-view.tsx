"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { runChecks } from "@/lib/checks";
import { computeHygieneScore } from "@/lib/checks/score";
import type { CheckResult } from "@/lib/checks/types";
import { formatTokens, formatUsd } from "@/lib/cost";
import { formatDuration, formatPercent } from "@/lib/format";
import type { Run } from "@/lib/transcript/types";
import { useRunStore } from "./run-store";
import { StatusBadge } from "./status-badge";

export type CompareOption = { id: string; label: string; href: string; run: Run };

type Metric = {
  label: string;
  value: (run: Run, score: number) => number | null;
  format: (value: number | null) => string;
  better: "lower" | "higher" | "none";
};

const METRICS: Metric[] = [
  { label: "Hygiene score", value: (_run, score) => score, format: (value) => (value === null ? "n/a" : `${value} / 100`), better: "higher" },
  { label: "Estimated cost", value: (run) => run.totals.costUsd, format: formatUsd, better: "lower" },
  { label: "Duration", value: (run) => run.totals.durationMs, format: formatDuration, better: "none" },
  { label: "Turns", value: (run) => run.totals.turns, format: (value) => String(value ?? "n/a"), better: "none" },
  { label: "Tool calls", value: (run) => run.totals.toolCalls, format: (value) => String(value ?? "n/a"), better: "none" },
  { label: "Subagents", value: (run) => run.totals.subagents, format: (value) => String(value ?? "n/a"), better: "none" },
  { label: "Cache hit rate", value: (run) => run.totals.cacheHitRate, format: formatPercent, better: "higher" },
  {
    label: "Total tokens",
    value: (run) => {
      const usage = run.totals.usage;
      return usage.input + usage.output + usage.cacheRead + usage.cacheWrite5m + usage.cacheWrite1h;
    },
    format: (value) => (value === null ? "n/a" : formatTokens(value)),
    better: "lower",
  },
];

function useScored(option: CompareOption | undefined) {
  return useMemo(() => {
    if (!option) return null;
    const checks = runChecks(option.run);
    return { option, checks, score: computeHygieneScore(checks).score };
  }, [option]);
}

function RunPicker({ label, value, options, onChange }: { label: string; value: string; options: CompareOption[]; onChange: (id: string) => void }) {
  const id = useId();
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="label-caps block">
        {label}
      </label>
      <select id={id} className="input mt-1" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function winner(metric: Metric, a: number | null, b: number | null): "a" | "b" | null {
  if (metric.better === "none" || a === null || b === null || a === b) return null;
  if (metric.better === "lower") return a < b ? "a" : "b";
  return a > b ? "a" : "b";
}

export function CompareView({ samples }: { samples: CompareOption[] }) {
  const { runs } = useRunStore();
  const options = useMemo<CompareOption[]>(
    () => [
      ...samples,
      ...runs.map((item) => ({
        id: item.id,
        label: `Uploaded: ${item.fileName}`,
        href: `/runs/local?id=${encodeURIComponent(item.id)}`,
        run: item.run,
      })),
    ],
    [samples, runs],
  );
  const [aId, setAId] = useState(samples[0]?.id ?? "");
  const [bId, setBId] = useState(samples[1]?.id ?? samples[0]?.id ?? "");
  const a = useScored(options.find((option) => option.id === aId));
  const b = useScored(options.find((option) => option.id === bId));

  if (!a || !b) return <p className="text-muted">Pick two runs to compare.</p>;

  const checkPairs: [CheckResult, CheckResult | undefined][] = a.checks.map((check) => [check, b.checks.find((other) => other.id === check.id)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <RunPicker label="Run A" value={aId} options={options} onChange={setAId} />
        <RunPicker label="Run B" value={bId} options={options} onChange={setBId} />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[480px] text-[14px]">
          <caption className="sr-only">Key metrics for run A and run B</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="px-4 py-3 font-medium text-muted">Metric</th>
              <th scope="col" className="px-4 py-3 font-medium">
                <Link href={a.option.href}>{a.option.label}</Link>
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                <Link href={b.option.href}>{b.option.label}</Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((metric) => {
              const valueA = metric.value(a.option.run, a.score);
              const valueB = metric.value(b.option.run, b.score);
              const best = winner(metric, valueA, valueB);
              return (
                <tr key={metric.label} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal text-muted">{metric.label}</th>
                  {(["a", "b"] as const).map((side) => (
                    <td key={side} className="px-4 py-2.5 font-mono tabular-nums">
                      {metric.format(side === "a" ? valueA : valueB)}
                      {best === side ? <span className="ml-2 text-[12px] text-success">better</span> : null}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[480px] text-[14px]">
          <caption className="border-b border-border px-4 py-3 text-left font-semibold">Automated checks</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Check</th>
              <th scope="col">Run A</th>
              <th scope="col">Run B</th>
            </tr>
          </thead>
          <tbody>
            {checkPairs.map(([checkA, checkB]) => (
              <tr key={checkA.id} className="border-b border-border last:border-b-0 align-top">
                <th scope="row" className="px-4 py-2.5 text-left font-normal">{checkA.title}</th>
                <td className="px-4 py-2.5">
                  <StatusBadge status={checkA.status} />
                  <span className="mt-1 block text-[12px] text-muted">{checkA.summary}</span>
                </td>
                <td className="px-4 py-2.5">
                  {checkB ? (
                    <>
                      <StatusBadge status={checkB.status} />
                      <span className="mt-1 block text-[12px] text-muted">{checkB.summary}</span>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
