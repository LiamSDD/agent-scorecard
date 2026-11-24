"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { runChecks } from "@/lib/checks";
import { computeHygieneScore } from "@/lib/checks/score";
import type { StoredReview } from "@/lib/review/stored";
import type { Run } from "@/lib/transcript/types";
import { ChecksPanel, ScorePanel } from "./checks-panel";
import { ReviewPanel } from "./review-panel";
import { RunHeader } from "./run-header";
import { Timeline } from "./timeline";

function ChartsPlaceholder() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((key) => (
        <div key={key} className="card h-[236px] bg-surface" />
      ))}
    </div>
  );
}

const RunCharts = dynamic(() => import("./charts"), { ssr: false, loading: ChartsPlaceholder });

export function RunView({
  run,
  source,
  storedReview = null,
}: {
  run: Run;
  source: string;
  storedReview?: StoredReview | null;
}) {
  const checks = useMemo(() => runChecks(run), [run]);
  const score = useMemo(() => computeHygieneScore(checks), [checks]);
  const [focusRequest, setFocusRequest] = useState<{ turnIndex: number; nonce: number } | null>(null);

  const jumpToTurn = useCallback((turnIndex: number) => {
    setFocusRequest((current) => ({ turnIndex, nonce: (current?.nonce ?? 0) + 1 }));
  }, []);

  return (
    <div className="container-page space-y-6 py-6 sm:py-8">
      <RunHeader run={run} source={source} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <ChecksPanel checks={checks} onJump={jumpToTurn} />
        <ScorePanel score={score} />
      </div>
      <section aria-label="Charts">
        <RunCharts run={run} />
      </section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="order-2 min-w-0 lg:order-1">
          <Timeline run={run} focusRequest={focusRequest} />
        </div>
        <div className="order-1 min-w-0 lg:order-2">
          <div className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-auto">
            <ReviewPanel run={run} checks={checks} storedReview={storedReview} onJump={jumpToTurn} />
          </div>
        </div>
      </div>
    </div>
  );
}
