import { isSampleId, SAMPLE_IDS } from "@/data/samples";
import { loadSampleText } from "@/lib/samples.server";

export function generateStaticParams() {
  return SAMPLE_IDS.map((id) => ({ id }));
}

export async function GET(_request: Request, { params }: RouteContext<"/samples/[id]">): Promise<Response> {
  const { id } = await params;
  if (!isSampleId(id)) return new Response("Not found", { status: 404 });
  return new Response(await loadSampleText(id), {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename="${id}.jsonl"`,
    },
  });
}
