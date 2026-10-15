import type { Metadata } from "next";
import { getPrisma } from "@/lib/prisma";
import { loadReviewDesk } from "@/lib/review/queue";
import { ReviewBoard } from "./review-board";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review",
  description: "Confirm or reject a receipt, and see documents that could not be attached.",
};

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active = tab === "unmatched" ? "unmatched" : "needs-review";
  const desk = await loadReviewDesk(getPrisma());
  return <ReviewBoard active={active} needsReview={desk.needsReview} unmatched={desk.unmatched} />;
}
