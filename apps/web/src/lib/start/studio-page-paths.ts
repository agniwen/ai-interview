import type { StudioPagePermissionAction } from "@/lib/start/auth-session-types";

/**
 * Ordered Studio pages used for default landing redirects and path→action mapping.
 * Keep in sync with studio sidebar navigation.
 */
export const STUDIO_PAGE_PATHS = [
  { action: "resumes", path: "/resumes" },
  { action: "resumePool", path: "/resume-pool" },
  { action: "interviews", path: "/interviews" },
  { action: "interviews", path: "/calendar" },
  { action: "dashboard", path: "/dashboard" },
  { action: "departments", path: "/departments" },
  { action: "interviewers", path: "/interviewers" },
  { action: "jobDescriptions", path: "/job-descriptions" },
  { action: "forms", path: "/forms" },
  { action: "interviewQuestions", path: "/interview-questions" },
  { action: "me", path: "/me" },
  { action: "members", path: "/members" },
  { action: "mailIngestAccounts", path: "/mail-ingest-accounts" },
  { action: "permissions", path: "/permissions" },
  { action: "globalConfig", path: "/global-config" },
] as const satisfies readonly {
  action: StudioPagePermissionAction;
  path: string;
}[];
