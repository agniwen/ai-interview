import { beforeEach, describe, expect, it, vi } from "vitest";
import { testClient } from "hono/testing";
import { factory } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";
import { createHumanInterviewMeetingDetailRouter } from "./route";
import type { loadHumanInterviewMeetingDetail } from "./dao";

const candidateId = "00000000-0000-4000-8000-000000000001";
const roundId = "00000000-0000-4000-8000-000000000002";
const meetingId = "00000000-0000-4000-8000-000000000003";
const load = vi.fn<typeof loadHumanInterviewMeetingDetail>();
const visibility = vi.fn(() =>
  Promise.resolve({ kind: "restricted" as const, userIds: ["creator"] }),
);
const authorizations: string[] = [];
let deny = "";

function app(loggedIn = true) {
  const auth = {
    createRequestWorkspaceAuthorizer: () => (request: { resource: string; action: string }) => {
      const permission = `${request.resource}:${request.action}`;
      authorizations.push(permission);
      return Promise.resolve(deny !== permission);
    },
  };
  return factory
    .createApp()
    .use("*", async (c, next) => {
      if (!loggedIn) {
        return c.json({ error: "请先登录" }, 401);
      }
      // SAFETY: transport fixtures contain every field read by the real permission middleware.
      c.set("user", { id: "hr-reader" } as never);
      // SAFETY: workspace middleware is replaced with this request-local test workspace.
      c.set("activeOrg", { id: "org" } as never);
      // SAFETY: only role is consumed by the injected authorizer and visibility resolver.
      c.set("member", { role: "member" } as never);
      await next();
    })
    .route(
      "/api/w/:slug/studio/interviews/:id/human-interview-rounds/:roundId/meetings",
      createHumanInterviewMeetingDetailRouter({
        load,
        requireInterviewRead: requirePermission("humanInterview", "read", auth),
        requireResumeRead: requirePermission("resumeLibrary", "read", auth),
        visibility,
      }),
    );
}

const path = `/api/w/workspace/studio/interviews/${candidateId}/human-interview-rounds/${roundId}/meetings/${meetingId}`;
beforeEach(() => {
  vi.clearAllMocks();
  deny = "";
  authorizations.length = 0;
  load.mockResolvedValue(null);
});

describe("meeting detail read boundary", () => {
  it("allows an HR reader without interviewer membership or update permission", async () => {
    deny = "humanInterview:update";
    load.mockResolvedValue({
      candidateId,
      candidateName: "候选人",
      endedAt: "2026-09-03T00:00:00.000Z",
      evaluation: null,
      evaluationError: null,
      evaluationStatus: "not_started",
      evaluationSubmittedAt: null,
      feedback: null,
      interviewers: [],
      meetingId,
      outcome: null,
      recordingNotice: null,
      roundId,
      roundLabel: "业务一面",
      roundStatus: "pending",
      scheduledAt: null,
      startedAt: null,
      title: "面试",
      transcript: null,
      transcriptBasis: "current",
      transcriptNotice: null,
      transcriptionError: null,
      transcriptionState: "processing",
    });
    const response = await app().request(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      meetingId,
      roundId,
      transcriptionState: "processing",
    });
    expect(authorizations).toEqual(["resumeLibrary:read", "humanInterview:read"]);
    expect(load).toHaveBeenCalledWith({
      candidateId,
      meetingId,
      organizationId: "org",
      roundId,
      visibility: { kind: "restricted", userIds: ["creator"] },
    });
    expect(visibility).toHaveBeenCalledWith({
      currentRole: "member",
      organizationId: "org",
      userId: "hr-reader",
    });
  });
  it.each(["resumeLibrary:read", "humanInterview:read"])(
    "enforces %s before reading data",
    async (permission) => {
      deny = permission;
      const response = await app().request(path);
      expect(response.status).toBe(403);
      expect(load).not.toHaveBeenCalled();
    },
  );
  it("rejects anonymous users and malformed identifiers", async () => {
    const anonymous = await app(false).request(path);
    expect(anonymous.status).toBe(401);
    const malformed = await app().request(path.replace(meetingId, "not-an-id"));
    expect(malformed.status).toBe(404);
    expect(load).not.toHaveBeenCalled();
  });
  it("does not mount any write operation", async () => {
    const response = await app().request(path, { method: "POST" });
    expect(response.status).toBe(404);
    expect(load).not.toHaveBeenCalled();
  });
  it("preserves the candidate, round and meeting in the RPC shape", async () => {
    const client = testClient(app());
    const response = await client.api.w[":slug"].studio.interviews[":id"]["human-interview-rounds"][
      ":roundId"
    ].meetings[":meetingId"].$get({
      param: { id: candidateId, meetingId, roundId, slug: "workspace" },
    });
    expect(response.status).toBe(404);
    expect(load).toHaveBeenCalledOnce();
  });
});
