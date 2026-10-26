import { z } from "zod";

export const recruitingWorkspaceViewSchema = z.enum(["hr", "records", "jobs", "dashboard"]);

export type RecruitingWorkspaceView = z.infer<typeof recruitingWorkspaceViewSchema>;

/** Keep each view behind its original page permission after merging the entry points. */
export function resolveRecruitingWorkspaceView(
  requested: RecruitingWorkspaceView,
  canViewLedger: boolean,
  canViewDashboard: boolean,
): RecruitingWorkspaceView | null {
  if (requested === "dashboard" && canViewDashboard) {
    return "dashboard";
  }
  if (canViewLedger) {
    return requested === "dashboard" ? "hr" : requested;
  }
  return canViewDashboard ? "dashboard" : null;
}
