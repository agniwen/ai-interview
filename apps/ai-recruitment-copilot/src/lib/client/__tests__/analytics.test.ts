import { describe, expect, it, vi } from "vitest";
import {
  captureAnalyticsEvent,
  capturePageViewed,
  identifyAnalyticsUser,
  normalizeAnalyticsPagePath,
  resetAnalyticsUser,
  sanitizeAnalyticsProperties,
} from "@/lib/client/analytics";
import type { AnalyticsClient } from "@/lib/client/analytics";

function createClient(enabled = true) {
  const client: AnalyticsClient = {
    capture: vi.fn(),
    identify: vi.fn(),
    isFeatureEnabled: vi.fn(),
    register: vi.fn(),
    reset: vi.fn(),
  };
  return {
    client,
    getClient: () => (enabled ? client : null),
  };
}

describe("analytics client wrapper", () => {
  it("drops obvious PII fields before capturing events", () => {
    const { client, getClient } = createClient();

    captureAnalyticsEvent(
      "resume_parse_completed",
      {
        candidateEmail: "candidate@example.com",
        candidateName: "张三",
        count: 1,
        durationMs: 1200,
        error_code: "none",
        file_name: "resume.pdf",
        phone: "13800000000",
        workspace_id: "org_1",
      },
      getClient,
    );

    expect(client.capture).toHaveBeenCalledWith("resume_parse_completed", {
      count: 1,
      duration_ms: 1200,
      error_code: "none",
      workspace_id: "org_1",
    });
  });

  it("does nothing when analytics is disabled", () => {
    const { client, getClient } = createClient(false);

    captureAnalyticsEvent("resume_upload_started", { count: 1 }, getClient);
    identifyAnalyticsUser("user_1", { workspaceId: "org_1" }, getClient);
    resetAnalyticsUser(getClient);

    expect(client.capture).not.toHaveBeenCalled();
    expect(client.identify).not.toHaveBeenCalled();
    expect(client.reset).not.toHaveBeenCalled();
  });

  it("adds identified user and workspace context to later events", () => {
    const { client, getClient } = createClient();

    identifyAnalyticsUser("user_1", { workspaceId: "org_1" }, getClient);
    captureAnalyticsEvent("resume_upload_started", { count: 1 }, getClient);

    expect(client.capture).toHaveBeenCalledWith("resume_upload_started", {
      count: 1,
      user_id: "user_1",
      workspace_id: "org_1",
    });

    resetAnalyticsUser(getClient);
  });

  it("normalizes safe property keys consistently", () => {
    expect(
      sanitizeAnalyticsProperties({
        batchId: "batch_1",
        departmentId: "dept_1",
        fileType: "pdf",
        jobDescriptionId: "jd_1",
      }),
    ).toEqual({
      batch_id: "batch_1",
      department_id: "dept_1",
      file_type: "pdf",
      job_description_id: "jd_1",
    });
  });

  it("captures normalized page views without workspace slugs or record ids", () => {
    const { client, getClient } = createClient();

    capturePageViewed("/w/acme/studio/interviews/round_123456789012?recordId=candidate_1", {
      getClient,
      workspaceId: "org_1",
    });

    expect(client.capture).toHaveBeenCalledWith("page_viewed", {
      page_key: "studio_interviews_detail",
      page_path: "/w/[workspace]/studio/interviews/[id]",
      page_section: "studio",
      workspace_id: "org_1",
    });
  });

  it("classifies known workspace pages", () => {
    expect(normalizeAnalyticsPagePath("/w/company/studio/resumes")).toEqual({
      pageKey: "studio_resumes",
      pagePath: "/w/[workspace]/studio/resumes",
      pageSection: "studio",
    });
  });
});
