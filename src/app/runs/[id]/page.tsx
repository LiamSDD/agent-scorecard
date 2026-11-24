import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RunView } from "@/components/run/run-view";
import { isSampleId, SAMPLE_IDS, SAMPLES } from "@/data/samples";
import { loadSample } from "@/lib/samples.server";

export function generateStaticParams() {
  return SAMPLE_IDS.map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/runs/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: isSampleId(id) ? `Sample: ${SAMPLES[id].name}` : "Run not found" };
}

export default async function SampleRunPage({ params }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  if (!isSampleId(id)) notFound();
  const sample = await loadSample(id);
  return (
    <>
      <div className="container-page flex flex-wrap items-center gap-x-4 gap-y-2 pt-6 text-[13px]">
        <span className="text-muted">Samples:</span>
        {SAMPLE_IDS.map((sampleId) => (
          <Link
            key={sampleId}
            href={`/runs/${sampleId}`}
            aria-current={sampleId === id ? "page" : undefined}
            className={sampleId === id ? "font-semibold text-text" : ""}
          >
            {SAMPLES[sampleId].name}
          </Link>
        ))}
        <a href={`/samples/${id}`} download={`${id}.jsonl`} className="ml-auto">
          Download transcript (.jsonl)
        </a>
      </div>
      <RunView run={sample.run} source={`Sample run · ${sample.meta.name} · synthetic data`} storedReview={sample.review} />
    </>
  );
}
