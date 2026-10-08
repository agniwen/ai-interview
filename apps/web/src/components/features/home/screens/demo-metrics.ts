import { toBeijingDayKey } from "@app/shared/beijing-calendar";
import type { ResumeLibraryMetrics } from "@app/shared/studio-resumes";

/** Fixtures use the production chart contract so the preview keeps the same layout. */
export function createDemoMetrics(personal: boolean): ResumeLibraryMetrics {
  const counts = personal ? [12, 8, 4, 2, 1, 9] : [28, 18, 10, 5, 4, 19];
  const users = ["葛城美里", "赤木律子", "碇源堂"];
  const personalCounts = [18, 0, 0];
  return {
    byPipeline: [
      { count: counts[0], outcome: "in_pipeline", stage: "screening" },
      { count: counts[1], outcome: "in_pipeline", stage: "ai_interview" },
      { count: counts[2], outcome: "in_pipeline", stage: "second_interview" },
      { count: counts[3], outcome: "in_pipeline", stage: "salary_negotiation" },
      { count: counts[4], outcome: "in_pipeline", stage: "onboarding" },
      { count: counts[5], outcome: "rejected", stage: "closed" },
    ],
    conversion: personal
      ? { withInterview: 16, withoutInterview: 20 }
      : { withInterview: 38, withoutInterview: 46 },
    dailyAdded: Array.from({ length: 2 }, (_, index) => ({
      byUser: users.map((userName, userIndex) => ({
        count: personal ? personalCounts[userIndex] : [18, 14, 10][userIndex],
        userId: userName,
        userImage: null,
        userName,
      })),
      count: personal ? 18 : 42,
      day: toBeijingDayKey(new Date(Date.now() - index * 86_400_000)),
    })),
  };
}
