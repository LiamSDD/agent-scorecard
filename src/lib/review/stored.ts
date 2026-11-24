import { z } from "zod";
import { ReviewSchema } from "./schema";

export const StoredReviewSchema = z.object({
  provenance: z.enum(["hand-authored-example", "model"]),
  model: z.string().nullable(),
  generatedAt: z.string().nullable(),
  review: ReviewSchema,
});

export type StoredReview = z.infer<typeof StoredReviewSchema>;

export function readStoredReview(value: unknown): StoredReview | null {
  const parsed = StoredReviewSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
