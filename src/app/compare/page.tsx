import type { Metadata } from "next";
import { CompareView, type CompareOption } from "@/components/compare-view";
import { SAMPLE_IDS } from "@/data/samples";
import { loadSample } from "@/lib/samples.server";

export const metadata: Metadata = { title: "Compare runs" };

export default async function ComparePage() {
  const samples = await Promise.all(SAMPLE_IDS.map((id) => loadSample(id)));
  const options: CompareOption[] = samples.map((sample) => ({
    id: sample.meta.id,
    label: `Sample: ${sample.meta.name}`,
    href: `/runs/${sample.meta.id}`,
    run: sample.run,
  }));
  return (
    <div className="container-page py-10">
      <h1 className="text-[24px] font-semibold">Compare runs</h1>
      <p className="mt-2 text-[15px] text-muted">
        Pick any two runs: the samples, or transcripts you uploaded in this tab.
      </p>
      <div className="mt-6">
        <CompareView samples={options} />
      </div>
    </div>
  );
}
