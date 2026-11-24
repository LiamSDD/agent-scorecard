import type { Metadata } from "next";
import { Suspense } from "react";
import { LocalRun } from "@/components/local-run";

export const metadata: Metadata = { title: "Uploaded run" };

export default function LocalRunPage() {
  return (
    <Suspense fallback={<div className="container-page py-8 text-muted">Loading run…</div>}>
      <LocalRun />
    </Suspense>
  );
}
