import { connection } from "next/server";
import { handleReviewRequest, sharedKeyAvailable } from "@/lib/review/handler";

export async function POST(request: Request): Promise<Response> {
  return handleReviewRequest(request);
}

export async function GET(): Promise<Response> {
  await connection();
  return Response.json({ sharedKey: sharedKeyAvailable() }, { headers: { "cache-control": "no-store" } });
}
