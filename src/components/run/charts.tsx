"use client";

import { useId, type ReactNode } from "react";
import { cacheWriteTotal, formatTokens, formatUsd } from "@/lib/cost";
import { turnLabel } from "@/lib/format";
import type { Run } from "@/lib/transcript/types";

const WIDTH = 320;
const HEIGHT = 170;
const PAD = { top: 10, right: 10, bottom: 22, left: 50 };

function ChartFrame({ title, description, children }: { title: string; description: string; children: (ids: { title: string; desc: string }) => ReactNode }) {
  const id = useId();
  const ids = { title: `${id}-title`, desc: `${id}-desc` };
  return (
    <figure className="card p-4">
      <figcaption className="mb-3">
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="block text-[12px] text-muted">{description}</span>
      </figcaption>
      {children(ids)}
    </figure>
  );
}

export function cumulativeCost(run: Run): { index: number; total: number; subagent: boolean }[] {
  return run.turns.reduce<{ index: number; total: number; subagent: boolean }[]>((points, turn) => {
    const previous = points.length ? points[points.length - 1].total : 0;
    points.push({ index: turn.index, total: previous + (turn.costUsd ?? 0), subagent: turn.agentId !== null });
    return points;
  }, []);
}

export function CumulativeCostChart({ run }: { run: Run }) {
  const points = cumulativeCost(run);
  const running = points.length ? points[points.length - 1].total : 0;
  const max = Math.max(running, 0.0001);
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (position: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (position / (points.length - 1)) * innerW);
  const y = (value: number) => PAD.top + innerH - (value / max) * innerH;
  const line = points.map((point, position) => `${position === 0 ? "M" : "L"}${x(position).toFixed(1)},${y(point.total).toFixed(1)}`).join(" ");
  const area = points.length ? `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : "";
  const ticks = [0, 0.5, 1].map((fraction) => fraction * max);
  const unpriced = run.totals.unpricedTurns;
  return (
    <ChartFrame
      title="Cumulative cost"
      description={`Estimated spend after each turn${unpriced ? `; ${unpriced} unpriced turns count as zero here` : ""}.`}
    >
      {(ids) => (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full max-w-[460px]" role="img" aria-labelledby={`${ids.title} ${ids.desc}`}>
          <title id={ids.title}>Cumulative cost over the run</title>
          <desc id={ids.desc}>
            {`Cost rises from ${formatUsd(points[0]?.total ?? 0)} at ${turnLabel(0)} to ${formatUsd(running)} after ${run.turns.length} turns.`}
          </desc>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeDasharray={tick === 0 ? undefined : "3 4"} />
              <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" fontFamily="var(--font-mono)">
                {formatUsd(tick)}
              </text>
            </g>
          ))}
          <path d={area} fill="var(--accent)" opacity="0.12" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
          {points.map((point, position) => (
            <circle key={point.index} cx={x(position)} cy={y(point.total)} r={points.length > 60 ? 1.5 : 2.5} fill={point.subagent ? "var(--chart-output)" : "var(--accent)"}>
              <title>{`${turnLabel(point.index)}: ${formatUsd(point.total)} cumulative${point.subagent ? " (subagent)" : ""}`}</title>
            </circle>
          ))}
          <text x={PAD.left} y={HEIGHT - 6} fontSize="11" fill="var(--muted)" fontFamily="var(--font-mono)">
            {turnLabel(0)}
          </text>
          <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" fontSize="11" fill="var(--muted)" fontFamily="var(--font-mono)">
            {points.length ? turnLabel(points[points.length - 1].index) : ""}
          </text>
        </svg>
      )}
    </ChartFrame>
  );
}

export function TokenMixChart({ run }: { run: Run }) {
  const usage = run.totals.usage;
  const segments = [
    { key: "input", label: "Input (uncached)", value: usage.input, color: "var(--chart-input)" },
    { key: "output", label: "Output", value: usage.output, color: "var(--chart-output)" },
    { key: "cacheRead", label: "Cache read", value: usage.cacheRead, color: "var(--chart-cache-read)" },
    { key: "cacheWrite", label: "Cache write", value: cacheWriteTotal(usage), color: "var(--chart-cache-write)" },
  ];
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const widths = segments.map((segment) => (total === 0 ? 0 : (segment.value / total) * WIDTH));
  const offsets = widths.map((_, position) => widths.slice(0, position).reduce((sum, width) => sum + width, 0));
  return (
    <ChartFrame title="Token mix" description="Where the tokens went across all turns, including subagents.">
      {(ids) => (
        <div>
          <svg viewBox={`0 0 ${WIDTH} 20`} className="h-5 w-full" role="img" aria-labelledby={`${ids.title} ${ids.desc}`} preserveAspectRatio="none">
            <title id={ids.title}>Token mix</title>
            <desc id={ids.desc}>
              {segments.map((segment) => `${segment.label} ${formatTokens(segment.value)}`).join(", ")}
            </desc>
            <rect x="0" y="0" width={WIDTH} height="20" rx="3" fill="var(--surface)" />
            {segments.map((segment, position) => (
              <rect key={segment.key} x={offsets[position]} y="0" width={widths[position]} height="20" fill={segment.color} />
            ))}
          </svg>
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {segments.map((segment) => (
              <li key={segment.key} className="flex items-center gap-2">
                <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: segment.color }} aria-hidden="true" />
                <span className="text-muted">{segment.label}</span>
                <span className="ml-auto font-mono tabular-nums">
                  {formatTokens(segment.value)}
                  <span className="text-muted"> {total ? Math.round((segment.value / total) * 100) : 0}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartFrame>
  );
}

export function ToolUsageChart({ run }: { run: Run }) {
  const counts = new Map<string, { count: number; errors: number }>();
  for (const turn of run.turns) {
    for (const call of turn.toolCalls) {
      const entry = counts.get(call.name) ?? { count: 0, errors: 0 };
      entry.count += 1;
      if (call.result?.isError) entry.errors += 1;
      counts.set(call.name, entry);
    }
  }
  const rows = [...counts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  const max = Math.max(1, ...rows.map(([, value]) => value.count));
  const rowHeight = 22;
  const labelWidth = 88;
  const height = Math.max(rowHeight, rows.length * rowHeight);
  return (
    <ChartFrame title="Tool usage" description="Calls per tool. Red marks calls that returned an error.">
      {(ids) =>
        rows.length === 0 ? (
          <p className="text-[13px] text-muted">No tool calls in this run.</p>
        ) : (
          <svg viewBox={`0 0 ${WIDTH} ${height}`} className="h-auto w-full max-w-[460px]" role="img" aria-labelledby={`${ids.title} ${ids.desc}`}>
            <title id={ids.title}>Tool usage</title>
            <desc id={ids.desc}>{rows.map(([name, value]) => `${name} ${value.count}${value.errors ? ` (${value.errors} errors)` : ""}`).join(", ")}</desc>
            {rows.map(([name, value], position) => {
              const barWidth = ((WIDTH - labelWidth - 30) * value.count) / max;
              const errorWidth = ((WIDTH - labelWidth - 30) * value.errors) / max;
              const top = position * rowHeight;
              return (
                <g key={name}>
                  <text x={labelWidth - 8} y={top + 16} textAnchor="end" fontSize="12" fill="var(--text)" fontFamily="var(--font-mono)">
                    {name.length > 12 ? `${name.slice(0, 11)}…` : name}
                  </text>
                  <rect x={labelWidth} y={top + 5} width={barWidth} height="14" rx="2" fill="var(--accent)" opacity="0.85" />
                  {errorWidth > 0 ? <rect x={labelWidth + barWidth - errorWidth} y={top + 5} width={errorWidth} height="14" rx="2" fill="var(--danger)" /> : null}
                  <text x={labelWidth + barWidth + 6} y={top + 16} fontSize="12" fill="var(--muted)" fontFamily="var(--font-mono)">
                    {value.count}
                  </text>
                </g>
              );
            })}
          </svg>
        )
      }
    </ChartFrame>
  );
}

export default function RunCharts({ run }: { run: Run }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <CumulativeCostChart run={run} />
      <TokenMixChart run={run} />
      <ToolUsageChart run={run} />
    </div>
  );
}
