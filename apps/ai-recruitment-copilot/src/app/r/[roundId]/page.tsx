import type { Metadata } from "next";
import { PublicInterviewRoundPage } from "./_components/public-interview-round-page";

export const metadata: Metadata = {
  title: "面试详情",
};

export default async function PublicInterviewRoundRoute({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const { roundId } = await params;
  return <PublicInterviewRoundPage roundId={roundId} />;
}
