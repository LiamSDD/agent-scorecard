"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RunView } from "./run/run-view";
import { useRunStore } from "./run-store";

export function LocalRun() {
  const id = useSearchParams().get("id") ?? "";
  const { getRun } = useRunStore();
  const stored = getRun(id);
  if (!stored) {
    return (
      <div className="container-page py-12">
        <div className="card max-w-[640px] p-6">
          <h1 className="text-[18px] font-semibold">This run is no longer in memory</h1>
          <p className="mt-2 text-[14px] text-muted">
            Uploaded transcripts live only in this browser tab and are dropped when you reload or close it. Nothing was
            saved on a server, so upload the file again to view it.
          </p>
          <Link href="/upload" className="btn btn-primary mt-4">
            Upload a transcript
          </Link>
        </div>
      </div>
    );
  }
  return <RunView run={stored.run} source={`Uploaded · ${stored.fileName}`} />;
}
