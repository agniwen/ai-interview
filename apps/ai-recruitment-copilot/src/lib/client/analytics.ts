import "client-only";

import posthog from "posthog-js";

export interface AnalyticsClient {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string, properties?: Record<string, unknown>) => void;
  isFeatureEnabled?: (key: string) => boolean | undefined;
  register?: (properties: Record<string, unknown>) => void;
  reset: () => void;
}

export type AnalyticsEventName =
  | "interview_created"
  | "interview_completed"
  | "interviewer_created"
  | "job_description_created"
  | "job_description_updated"
  | "job_interviewer_matched"
  | "page_viewed"
  | "resume_parse_completed"
  | "resume_parse_failed"
  | "resume_parse_started"
  | "resume_upload_completed"
  | "resume_upload_started";

type AnalyticsProperties = Record<string, unknown>;
type GetAnalyticsClient = () => AnalyticsClient | null;

const POSTHOG_DEFAULTS = "2026-01-30";

const SAFE_PROPERTY_KEYS = new Set([
  "allow_cross_department_interviewers",
  "batch_id",
  "count",
  "department_id",
  "duration_ms",
  "error_code",
  "file_size",
  "file_type",
  "has_resume_payload",
  "interview_round_id",
  "interviewer_id",
  "job_description_id",
  "matched",
  "mode",
  "page_key",
  "page_path",
  "page_section",
  "question_count",
  "resume_id",
  "role",
  "source",
  "status",
  "user_id",
  "workspace_id",
]);

const PII_KEY_RE = /(?:candidate|email|file_?name|full_?name|name|phone|resume_?text|text)/i;
const TRAILING_SLASH_RE = /\/+$/;
const WORKSPACE_PREFIX_RE = /^\/w\/[^/]+/;
const STUDIO_DETAIL_RE =
  /(\/studio\/(?:departments|forms|interview-questions|interviewers|interviews|job-descriptions|resumes)\/)[^/]+/;

const PAGE_KEY_BY_PATH_PREFIX: [string, { pageKey: string; pageSection: string }][] = [
  [
    "/w/[workspace]/studio/resumes/[id]",
    { pageKey: "studio_resumes_detail", pageSection: "studio" },
  ],
  ["/w/[workspace]/studio/resumes", { pageKey: "studio_resumes", pageSection: "studio" }],
  [
    "/w/[workspace]/studio/interviews/[id]",
    { pageKey: "studio_interviews_detail", pageSection: "studio" },
  ],
  ["/w/[workspace]/studio/interviews", { pageKey: "studio_interviews", pageSection: "studio" }],
  [
    "/w/[workspace]/studio/interviewers/[id]",
    { pageKey: "studio_interviewers_detail", pageSection: "studio" },
  ],
  ["/w/[workspace]/studio/interviewers", { pageKey: "studio_interviewers", pageSection: "studio" }],
  [
    "/w/[workspace]/studio/job-descriptions/[id]",
    { pageKey: "studio_job_descriptions_detail", pageSection: "studio" },
  ],
  [
    "/w/[workspace]/studio/job-descriptions",
    { pageKey: "studio_job_descriptions", pageSection: "studio" },
  ],
  [
    "/w/[workspace]/studio/departments/[id]",
    { pageKey: "studio_departments_detail", pageSection: "studio" },
  ],
  ["/w/[workspace]/studio/departments", { pageKey: "studio_departments", pageSection: "studio" }],
  [
    "/w/[workspace]/studio/interview-questions/[id]",
    { pageKey: "studio_interview_questions_detail", pageSection: "studio" },
  ],
  [
    "/w/[workspace]/studio/interview-questions",
    { pageKey: "studio_interview_questions", pageSection: "studio" },
  ],
  ["/w/[workspace]/studio/forms/[id]", { pageKey: "studio_forms_detail", pageSection: "studio" }],
  ["/w/[workspace]/studio/forms", { pageKey: "studio_forms", pageSection: "studio" }],
  [
    "/w/[workspace]/studio/global-config",
    { pageKey: "studio_global_config", pageSection: "studio" },
  ],
  ["/w/[workspace]/studio/members", { pageKey: "studio_members", pageSection: "studio" }],
  ["/w/[workspace]/chat", { pageKey: "chat", pageSection: "chat" }],
  ["/w/[workspace]", { pageKey: "workspace_home", pageSection: "workspace" }],
];

const analyticsContext = new Map<string, unknown>();

export function isPostHogEnabled() {
  return (
    process.env.NEXT_PUBLIC_ENABLE_POSTHOG === "true" &&
    Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN)
  );
}

export function initializePostHog() {
  if (!isPostHogEnabled()) {
    return;
  }

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN as string, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    autocapture: false,
    capture_pageleave: true,
    capture_pageview: false,
    defaults: POSTHOG_DEFAULTS,
    disable_session_recording: true,
    mask_all_element_attributes: true,
    mask_all_text: true,
    person_profiles: "identified_only",
  });
}

export function getPostHogClient(): AnalyticsClient | null {
  if (!isPostHogEnabled()) {
    return null;
  }
  return posthog;
}

function toSnakeCase(key: string) {
  return key.replaceAll(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function isSafeAnalyticsValue(value: unknown) {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  );
}

export function sanitizeAnalyticsProperties(properties: AnalyticsProperties = {}) {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    const normalizedKey = toSnakeCase(key);
    if (PII_KEY_RE.test(key) || !SAFE_PROPERTY_KEYS.has(normalizedKey)) {
      continue;
    }
    if (!isSafeAnalyticsValue(value)) {
      continue;
    }
    sanitized[normalizedKey] = value;
  }

  return sanitized;
}

function setAnalyticsContext(
  properties: AnalyticsProperties,
  getClient: GetAnalyticsClient = getPostHogClient,
) {
  const sanitized = sanitizeAnalyticsProperties(properties);
  for (const [key, value] of Object.entries(sanitized)) {
    if (value === null) {
      analyticsContext.delete(key);
    } else {
      analyticsContext.set(key, value);
    }
  }

  getClient()?.register?.(Object.fromEntries(analyticsContext));
}

function clearAnalyticsContext() {
  analyticsContext.clear();
}

function normalizePathname(pathname: string) {
  const [withoutQuery = "/"] = pathname.split(/[?#]/);
  const trimmed =
    withoutQuery.length > 1 ? withoutQuery.replace(TRAILING_SLASH_RE, "") : withoutQuery;
  return trimmed || "/";
}

function classifyPagePath(pagePath: string) {
  const match = PAGE_KEY_BY_PATH_PREFIX.find(([prefix]) => pagePath.startsWith(prefix));
  if (match) {
    return match[1];
  }

  const fallbackKey = pagePath
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replaceAll(/[[\]-]/g, "_"))
    .join("_");

  return {
    pageKey: fallbackKey || "root",
    pageSection: pagePath.split("/").filter(Boolean)[2] ?? "app",
  };
}

export function normalizeAnalyticsPagePath(pathname: string) {
  const pagePath = normalizePathname(pathname)
    .replace(WORKSPACE_PREFIX_RE, "/w/[workspace]")
    .replace(STUDIO_DETAIL_RE, "$1[id]");
  const { pageKey, pageSection } = classifyPagePath(pagePath);

  return {
    pageKey,
    pagePath,
    pageSection,
  };
}

export function captureAnalyticsEvent(
  event: AnalyticsEventName,
  properties: AnalyticsProperties = {},
  getClient: GetAnalyticsClient = getPostHogClient,
) {
  const client = getClient();
  if (!client) {
    return;
  }

  client.capture(
    event,
    sanitizeAnalyticsProperties({ ...Object.fromEntries(analyticsContext), ...properties }),
  );
}

export function capturePageViewed(
  pathname: string | null | undefined,
  options: { getClient?: GetAnalyticsClient; workspaceId?: string | null } = {},
) {
  if (!pathname) {
    return;
  }

  const { pageKey, pagePath, pageSection } = normalizeAnalyticsPagePath(pathname);
  captureAnalyticsEvent(
    "page_viewed",
    {
      pageKey,
      pagePath,
      pageSection,
      workspaceId: options.workspaceId ?? null,
    },
    options.getClient,
  );
}

export function identifyAnalyticsUser(
  userId: string | null | undefined,
  properties: AnalyticsProperties = {},
  getClient: GetAnalyticsClient = getPostHogClient,
) {
  const client = getClient();
  if (!client || !userId) {
    return;
  }

  const identifyProperties = sanitizeAnalyticsProperties({ ...properties, userId });
  setAnalyticsContext(identifyProperties, getClient);
  client.identify(userId, identifyProperties);
}

export function resetAnalyticsUser(getClient: GetAnalyticsClient = getPostHogClient) {
  const client = getClient();
  if (!client) {
    return;
  }

  clearAnalyticsContext();
  client.reset();
}
