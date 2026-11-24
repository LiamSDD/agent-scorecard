import type { Review } from "./schema";

export type ReviewDimensionKey = Exclude<keyof Review, "verdict" | "recommendations">;

export const REVIEW_DIMENSIONS: { key: ReviewDimensionKey; label: string }[] = [
  { key: "taskCompletion", label: "Task completion" },
  { key: "codeQuality", label: "Code quality and sanity" },
  { key: "safety", label: "Safety" },
  { key: "efficiency", label: "Efficiency" },
  { key: "communication", label: "Communication" },
];
