import { testClient } from "hono/testing";
/* oxlint-disable max-lines -- Meeting route authorization scenarios share one typed Hono client fixture. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "../../factory";
import { LiveTranscriptAuthorizationRateLimitError } from "./routes/live-transcript/authorization-gate";
import { createMeetingsRouter } from "./route";

const mocks = {
  addMeetingNote: vi.fn(),
  changeMeetingRecruitingContext: vi.fn(),
  completeSmallSavedMeeting: vi.fn(),
  correctSavedMeetingTranscript: vi.fn(),
  createMeetingPlaybackAuthorization: vi.fn(),
  createMultipartSavedMeeting: vi.fn(),
  createSmallSavedMeeting: vi.fn(),
  createWorkspaceMeetingLiveTranscriptAuthorization: vi.fn(),
  generateRecordingTitle: vi.fn(),
  getMeetingNotes: vi.fn(),
  getMeetingRecruitingContext: vi.fn(),
  getSavedMeetingDetail: vi.fn(),
  getSavedMeetingIntelligence: vi.fn(),
  getSavedMeetingTranscript: vi.fn(),
  getSavedMeetingTranscriptHistory: vi.fn(),
  getSavedMeetingTranscriptRevision: vi.fn(),
  getWorkspaceMeetingTranscriptionPolicy: vi.fn(),
  heartbeatSavedMeetingUpload: vi.fn(),
  listSavedMeetings: vi.fn(),
  permanentlyPurgeSavedMeeting: vi.fn(),
  reassignSavedMeetingOwner: vi.fn(),
  regenerateSavedMeetingIntelligence: vi.fn(),
  renameSavedMeeting: vi.fn(),
  retryMeetingPlayback: vi.fn(),
  searchSavedMeetings: vi.fn(),
  updateMeetingShare: vi.fn(),
  updateWorkspaceMeetingTranscriptionPolicy: vi.fn(),
};

const MEETING_ID = "00000000-0000-4000-8000-000000000072";
const MANIFEST_SHA = "a".repeat(64);
const MIC_SHA = "b".repeat(64);
const SYSTEM_SHA = "c".repeat(64);
const createInput = {
  assets: [
    {
      contentType: "audio/webm;codecs=opus",
      durationMs: 15_000,
      fragmentCount: 1,
      sha256: MIC_SHA,
      sizeBytes: 5,
      track: "microphone" as const,
    },
    {
      contentType: "audio/webm;codecs=opus",
      durationMs: 15_000,
      fragmentCount: 1,
      sha256: SYSTEM_SHA,
      sizeBytes: 8,
      track: "system" as const,
    },
  ],
  id: MEETING_ID,
  manifestSha256: MANIFEST_SHA,
  savedAt: "2026-08-09T02:01:00.000Z",
  startedAt: "2026-08-09T02:00:00.000Z",
};

const childContext = () => ({
  memberRole: "admin",
  organizationId: "org-72",
  userId: "user-72",
});

const playbackRouter = factory
  .createApp()
  .get("/", async (c) => {
    const result = await mocks.createMeetingPlaybackAuthorization({
      meetingId: c.req.param("id"),
      ...childContext(),
    });
    return c.json(result, 200);
  })
  .post("/retry", async (c) => {
    const result = await mocks.retryMeetingPlayback({
      meetingId: c.req.param("id"),
      ...childContext(),
    });
    if (result === "forbidden") {
      return c.json({ error: "无权重试会议处理" }, 403);
    }
    return c.json(result, 202);
  });

const searchRouter = factory.createApp().get("/", async (c) => {
  const query = c.req.query("q")?.trim() ?? "";
  if (!query) {
    return c.json({ error: "请输入搜索关键词" }, 400);
  }
  const result = await mocks.searchSavedMeetings({
    limit: Number(c.req.query("limit") ?? 20),
    organizationId: "org-72",
    query,
    timeZone: c.req.query("timeZone") ?? "UTC",
    userId: "user-72",
  });
  return c.json({ records: result }, 200);
});

const titleRouter = factory.createApp().post("/", async (c) => {
  const body = await c.req.json<{ transcript: string }>();
  const title = await mocks.generateRecordingTitle(body.transcript);
  return c.json({ title }, 200);
});

const recruitingContextRouter = factory
  .createApp()
  .get("/", async (c) => {
    const result = await mocks.getMeetingRecruitingContext({
      meetingId: c.req.param("id"),
      ...childContext(),
    });
    return c.json(result, 200);
  })
  .put("/", async (c) => {
    const body = await c.req.json<{ recruitingRecordId: string }>();
    const result = await mocks.changeMeetingRecruitingContext({
      meetingId: c.req.param("id"),
      recruitingRecordId: body.recruitingRecordId,
      ...childContext(),
    });
    if (result === "invalid-record") {
      return c.json({ error: "招聘记录不存在或无权访问" }, 404);
    }
    return c.json(result, 200);
  });

const intelligenceRouter = factory
  .createApp()
  .get("/", async (c) =>
    c.json(
      await mocks.getSavedMeetingIntelligence({ meetingId: c.req.param("id"), ...childContext() }),
      200,
    ),
  )
  .post("/", async (c) => {
    const body = await c.req.json<{ template: string }>();
    const result = await mocks.regenerateSavedMeetingIntelligence({
      meetingId: c.req.param("id"),
      template: body.template,
      ...childContext(),
    });
    return c.json(result, 202);
  });

const notesRouter = factory
  .createApp()
  .get("/", async (c) => {
    const records = await mocks.getMeetingNotes({
      meetingId: c.req.param("id"),
      ...childContext(),
    });
    return c.json({ records }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json<{ body: string; meetingTimeMs: number }>();
    const result = await mocks.addMeetingNote({
      meetingId: c.req.param("id"),
      ...childContext(),
      ...body,
    });
    if (result === "forbidden") {
      return c.json({ error: "无权创建会议笔记" }, 403);
    }
    if (result === "limit-exceeded") {
      return c.json({ error: "会议笔记超出搜索范围" }, 409);
    }
    return c.json(result, 201);
  });

const shareRouter = factory
  .createApp()
  .put("/", async (c) => {
    const share = await c.req.json();
    const result = await mocks.updateMeetingShare({
      meetingId: c.req.param("id"),
      share,
      ...childContext(),
    });
    return c.json(result, 200);
  })
  .post("/owner", async (c) => {
    const body = await c.req.json<{ userId: string }>();
    const result = await mocks.reassignSavedMeetingOwner({
      meetingId: c.req.param("id"),
      targetUserId: body.userId,
      ...childContext(),
    });
    if (result === "not-custodied") {
      return c.json({ error: "会议当前仍由工作区成员负责" }, 409);
    }
    return c.json(result, 200);
  });

const liveTranscriptRouter = factory.createApp().post("/", async (c) => {
  const body = await c.req.json<{ captureId: string; track: "microphone" | "system" }>();
  try {
    const result = await mocks.createWorkspaceMeetingLiveTranscriptAuthorization({
      captureId: body.captureId,
      organizationId: "org-72",
      track: body.track,
      userId: "user-72",
    });
    if (result === "capacity") {
      return c.json(
        {
          code: "live-transcript-capacity-exhausted",
          error: "实时字幕容量已满，Meeting Recording 仍在本地继续",
        },
        429,
      );
    }
    return c.json(result, 201, { "Cache-Control": "no-store" });
  } catch (error) {
    if (error instanceof LiveTranscriptAuthorizationRateLimitError) {
      return c.json({ error: "实时字幕请求过于频繁" }, 429, {
        "Retry-After": String(error.retryAfterSeconds),
      });
    }
    throw error;
  }
});

const transcriptionPolicyRouter = factory
  .createApp()
  .get("/", async (c) =>
    c.json(await mocks.getWorkspaceMeetingTranscriptionPolicy(childContext()), 200),
  )
  .put("/", async (c) => {
    const policy = await c.req.json();
    const result = await mocks.updateWorkspaceMeetingTranscriptionPolicy({
      policy,
      ...childContext(),
    });
    return c.json(result, 200);
  });

const transcriptRouter = factory
  .createApp()
  .get("/", async (c) =>
    c.json(
      await mocks.getSavedMeetingTranscript({ meetingId: c.req.param("id"), ...childContext() }),
      200,
    ),
  )
  .post("/corrections", async (c) => {
    if (Number(c.req.header("content-length") ?? 0) > 8 * 1024 * 1024) {
      return c.json({ error: "会议转录修订请求过大" }, 413);
    }
    const correction = await c.req.json();
    const result = await mocks.correctSavedMeetingTranscript({
      correction,
      meetingId: c.req.param("id"),
      ...childContext(),
    });
    if (result === "conflict") {
      return c.json({ error: "会议转录已被其他人更新，请刷新后重试" }, 409);
    }
    return c.json(result, 201);
  })
  .get("/revisions", async (c) =>
    c.json(
      await mocks.getSavedMeetingTranscriptHistory({
        meetingId: c.req.param("id"),
        ...childContext(),
      }),
      200,
    ),
  )
  .get("/revisions/:revisionId", async (c) =>
    c.json(
      await mocks.getSavedMeetingTranscriptRevision({
        meetingId: c.req.param("id"),
        revisionId: c.req.param("revisionId"),
        ...childContext(),
      }),
      200,
    ),
  );

const emptyRouter = factory.createApp();

const meetingsRouter = createMeetingsRouter({
  ...mocks,
  meetingExportsRouter: emptyRouter,
  meetingIntelligenceRouter: intelligenceRouter,
  meetingLiveTranscriptRouter: liveTranscriptRouter,
  meetingNotesRouter: notesRouter,
  meetingPlaybackRouter: playbackRouter,
  meetingQuestionsRouter: emptyRouter,
  meetingRecruitingContextRouter: recruitingContextRouter,
  meetingRestoreRouter: emptyRouter,
  meetingSearchRouter: searchRouter,
  meetingShareRouter: shareRouter,
  meetingTitleRouter: titleRouter,
  meetingTranscriptRouter: transcriptRouter,
  meetingTranscriptionPolicyRouter: transcriptionPolicyRouter,
  meetingTrashActionRouter: emptyRouter,
  meetingTrashRouter: emptyRouter,
});

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("activeOrg", { id: "org-72" } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("member", { role: "admin" } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("user", { id: "user-72" } as never);
      await next();
    })
    .route("/meetings", meetingsRouter);
}

const client = testClient(makeApp());

describe("Meeting Buddy small Saved Meeting control plane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates object-level upload instructions using the client idempotency identity", async () => {
    mocks.createSmallSavedMeeting.mockResolvedValue({
      created: true,
      meetingId: MEETING_ID,
      state: "uploading",
      uploads: [
        {
          contentType: "audio/webm;codecs=opus",
          expiresAt: "2026-08-09T02:06:00.000Z",
          method: "PUT",
          sizeBytes: 5,
          track: "microphone",
          url: "https://r2.invalid/microphone",
        },
        {
          contentType: "audio/webm;codecs=opus",
          expiresAt: "2026-08-09T02:06:00.000Z",
          method: "PUT",
          sizeBytes: 8,
          track: "system",
          url: "https://r2.invalid/system",
        },
      ],
    });

    const response = await client.meetings.$post({ json: createInput });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      meetingId: MEETING_ID,
      state: "uploading",
      uploads: [{ method: "PUT", track: "microphone" }, { track: "system" }],
    });
    expect(mocks.createSmallSavedMeeting).toHaveBeenCalledWith({
      input: createInput,
      organizationId: "org-72",
      ownerId: "user-72",
    });
  });

  it("generates a concise recording title from live transcript content", async () => {
    mocks.generateRecordingTitle.mockResolvedValue("候选人项目经验沟通");

    const response = await client.meetings.title.$post({
      json: { transcript: "候选人正在介绍项目经验和技术方案取舍" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ title: "候选人项目经验沟通" });
    expect(mocks.generateRecordingTitle).toHaveBeenCalledWith(
      "候选人正在介绍项目经验和技术方案取舍",
    );
  });

  it("rejects an idempotency conflict instead of creating another meeting", async () => {
    mocks.createSmallSavedMeeting.mockResolvedValue({
      conflict: true,
      message: "Meeting Session 已绑定另一份本地录音清单",
    });

    const response = await client.meetings.$post({ json: createInput });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Meeting Session 已绑定另一份本地录音清单",
    });
  });

  it("returns an explicit retryable state when direct-upload capacity is full", async () => {
    mocks.createSmallSavedMeeting.mockResolvedValue({
      code: "meeting-upload-capacity-exhausted",
      conflict: true,
      message: "录音上传容量已满，本地 Meeting Recording 已保留",
    });

    const response = await client.meetings.$post({ json: createInput });

    expect(await response.json()).toEqual({
      code: "meeting-upload-capacity-exhausted",
      error: "录音上传容量已满，本地 Meeting Recording 已保留",
    });
  });

  it("creates a resumable multipart plan for large logical source tracks", async () => {
    const firstPartBytes = 8 * 1024 * 1024;
    const multipartInput = {
      ...createInput,
      assets: createInput.assets.map((asset) => ({
        ...asset,
        parts: [
          {
            md5Base64: "6NxAgbE0NLRRiacgt3toGA==",
            offsetBytes: 0,
            partNumber: 1,
            sizeBytes: firstPartBytes,
          },
          {
            md5Base64: "e+1lendcN8JXB4bQy+79iA==",
            offsetBytes: firstPartBytes,
            partNumber: 2,
            sizeBytes: 2,
          },
        ],
        sizeBytes: firstPartBytes + 2,
      })),
    };
    mocks.createMultipartSavedMeeting.mockResolvedValue({
      created: false,
      meetingId: MEETING_ID,
      state: "uploading",
      uploads: [
        {
          expiresAt: "2026-08-09T02:06:00.000Z",
          headers: { "content-md5": "e+1lendcN8JXB4bQy+79iA==" },
          method: "PUT",
          offsetBytes: firstPartBytes,
          partNumber: 2,
          sizeBytes: 2,
          track: "microphone",
          url: "https://r2.invalid/microphone-part-2",
        },
      ],
    });

    const response = await client.meetings.multipart.$post({ json: multipartInput });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state: "uploading",
      uploads: [{ partNumber: 2, track: "microphone" }],
    });
    expect(mocks.createMultipartSavedMeeting).toHaveBeenCalledWith({
      input: multipartInput,
      organizationId: "org-72",
      ownerId: "user-72",
    });
  });

  it("verifies both source objects before completing idempotently", async () => {
    mocks.completeSmallSavedMeeting.mockResolvedValue({
      completed: true,
      meetingId: MEETING_ID,
      state: "workspace-verified",
    });

    const response = await client.meetings[":id"].complete.$post({
      json: { manifestSha256: MANIFEST_SHA },
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      meetingId: MEETING_ID,
      state: "workspace-verified",
    });
    expect(mocks.completeSmallSavedMeeting).toHaveBeenCalledWith({
      manifestSha256: MANIFEST_SHA,
      meetingId: MEETING_ID,
      organizationId: "org-72",
      ownerId: "user-72",
    });
  });

  it("lists private Saved Meetings using owner-or-administrator authorization", async () => {
    mocks.listSavedMeetings.mockResolvedValue([
      {
        creator: { id: "owner-74", image: null, name: "Alice" },
        durationMs: 62_000,
        id: MEETING_ID,
        processingState: "ready",
        recordingAvailable: true,
        savedAt: "2026-08-09T04:00:00.000Z",
        title: "录制记录-2608091200",
      },
    ]);

    const response = await client.meetings.$get();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      records: [{ id: MEETING_ID, recordingAvailable: true }],
    });
    expect(mocks.listSavedMeetings).toHaveBeenCalledWith({
      memberRole: "admin",
      organizationId: "org-72",
      userId: "user-72",
    });
  });

  it("searches only through the server-owned authorized Meeting Library projection", async () => {
    mocks.searchSavedMeetings.mockResolvedValue([
      {
        accessRole: "administrator",
        creator: { id: "owner-74", image: null, name: "Alice" },
        durationMs: 62_000,
        id: MEETING_ID,
        match: {
          endMs: 34_000,
          kind: "transcript",
          snippet: "客户预算需要在本周确认",
          startMs: 30_000,
        },
        processingState: "ready",
        recordingAvailable: true,
        savedAt: "2026-08-09T04:00:00.000Z",
        title: "预算复盘",
        workspaceCustodied: false,
      },
    ]);

    const response = await client.meetings.search.$get({
      query: { limit: "20", q: "预算", timeZone: "Asia/Shanghai" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      records: [{ id: MEETING_ID, match: { kind: "transcript", startMs: 30_000 } }],
    });
    expect(mocks.searchSavedMeetings).toHaveBeenCalledWith({
      limit: 20,
      organizationId: "org-72",
      query: "预算",
      timeZone: "Asia/Shanghai",
      userId: "user-72",
    });
  });

  it("rejects an empty Meeting Library search before querying the projection", async () => {
    const response = await client.meetings.search.$get({ query: { q: "   " } });

    expect(response.status).toBe(400);
    expect(mocks.searchSavedMeetings).not.toHaveBeenCalled();
  });

  it("returns the same 404 for a missing or unauthorized private meeting", async () => {
    mocks.getSavedMeetingDetail.mockResolvedValue(null);

    const response = await client.meetings[":id"].$get({ param: { id: MEETING_ID } });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Meeting Session 不存在" });
    expect(mocks.getSavedMeetingDetail).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      memberRole: "admin",
      organizationId: "org-72",
      userId: "user-72",
    });
  });

  it("renames an authorized meeting with validated metadata", async () => {
    mocks.renameSavedMeeting.mockResolvedValue({ title: "产品复盘" });

    const response = await client.meetings[":id"].$patch({
      json: { title: "产品复盘" },
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ title: "产品复盘" });
    expect(mocks.renameSavedMeeting).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      memberRole: "admin",
      organizationId: "org-72",
      title: "产品复盘",
      userId: "user-72",
    });
  });

  it("returns and changes one Recruiting Context Link without exposing invalid records", async () => {
    mocks.getMeetingRecruitingContext.mockResolvedValue({
      canManage: true,
      link: {
        linkedAt: "2026-08-09T10:30:00.000Z",
        linkedBy: "user-72",
        record: {
          candidateName: "Alice",
          id: "candidate-79",
          jobDescriptionName: "Product Designer",
          outcome: "in_pipeline",
          pipelineStage: "human_interview",
          targetRole: "Product Designer",
        },
        templateSuggestion: "recruiting-interview",
      },
    });
    mocks.changeMeetingRecruitingContext.mockResolvedValue("invalid-record");

    const getResponse = await makeApp().request(`/meetings/${MEETING_ID}/recruiting-context`);
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      canManage: true,
      link: { record: { id: "candidate-79" } },
    });

    const putResponse = await makeApp().request(`/meetings/${MEETING_ID}/recruiting-context`, {
      body: JSON.stringify({ recruitingRecordId: "foreign-candidate" }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    expect(putResponse.status).toBe(404);
    await expect(putResponse.json()).resolves.toEqual({
      error: "招聘记录不存在或无权访问",
    });
  });

  it("returns versioned Meeting Intelligence and accepts an explicit template regeneration", async () => {
    mocks.getSavedMeetingIntelligence.mockResolvedValue({
      canRegenerate: true,
      current: null,
      error: null,
      history: [],
      state: "pending",
      suggestedTemplate: "recruiting-interview",
    });
    mocks.regenerateSavedMeetingIntelligence.mockResolvedValue({ state: "processing" });

    const getResponse = await makeApp().request(`/meetings/${MEETING_ID}/intelligence`);
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      state: "pending",
      suggestedTemplate: "recruiting-interview",
    });

    const postResponse = await makeApp().request(`/meetings/${MEETING_ID}/intelligence`, {
      body: JSON.stringify({ template: "recruiting-interview" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(postResponse.status).toBe(202);
    expect(mocks.regenerateSavedMeetingIntelligence).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      memberRole: "admin",
      organizationId: "org-72",
      template: "recruiting-interview",
      userId: "user-72",
    });
  });

  it("signs playback only after the same full meeting authorization", async () => {
    mocks.createMeetingPlaybackAuthorization.mockResolvedValue({
      expiresAt: "2026-08-09T04:06:00.000Z",
      url: "https://r2.invalid/playback.webm",
    });

    const response = await client.meetings[":id"].playback.$get({ param: { id: MEETING_ID } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      expiresAt: "2026-08-09T04:06:00.000Z",
      url: "https://r2.invalid/playback.webm",
    });
    expect(mocks.createMeetingPlaybackAuthorization).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      memberRole: "admin",
      organizationId: "org-72",
      userId: "user-72",
    });
  });

  it("accepts an authorized explicit playback retry", async () => {
    mocks.retryMeetingPlayback.mockResolvedValue({ state: "processing" });

    const response = await client.meetings[":id"].playback.retry.$post({
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ state: "processing" });
    expect(mocks.retryMeetingPlayback).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      memberRole: "admin",
      organizationId: "org-72",
      userId: "user-72",
    });
  });

  it("rejects a playback retry when the resolved meeting role is read-only", async () => {
    mocks.retryMeetingPlayback.mockResolvedValue("forbidden");

    const response = await client.meetings[":id"].playback.retry.$post({
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "无权重试会议处理" });
  });

  it("returns timestamped notes only after meeting access is authorized", async () => {
    mocks.getMeetingNotes.mockResolvedValue([
      {
        author: { id: "editor", name: "Editor" },
        body: "决定下周跟进",
        createdAt: "2026-08-09T06:00:00.000Z",
        id: "note-1",
        meetingTimeMs: 5000,
        updatedAt: "2026-08-09T06:00:00.000Z",
      },
    ]);

    const response = await client.meetings[":id"].notes.$get({ param: { id: MEETING_ID } });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      records: [{ id: "note-1", meetingTimeMs: 5000 }],
    });
  });

  it("rejects a viewer attempting to create a meeting note", async () => {
    mocks.addMeetingNote.mockResolvedValue("forbidden");

    const response = await client.meetings[":id"].notes.$post({
      json: { body: "不能写入", meetingTimeMs: 5000 },
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(403);
  });

  it("rejects a Meeting Note that would exceed the bounded search projection", async () => {
    mocks.addMeetingNote.mockResolvedValue("limit-exceeded");

    const response = await client.meetings[":id"].notes.$post({
      json: { body: "超出上限", meetingTimeMs: 5000 },
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(409);
  });

  it("updates selected grants and workspace visibility through the share subresource", async () => {
    mocks.updateMeetingShare.mockResolvedValue("updated");

    const response = await client.meetings[":id"].share.$put({
      json: {
        grants: [{ role: "editor", userId: "editor" }],
        visibility: "workspace",
      },
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(200);
    expect(mocks.updateMeetingShare).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      memberRole: "admin",
      organizationId: "org-72",
      share: { grants: [{ role: "editor", userId: "editor" }], visibility: "workspace" },
      userId: "user-72",
    });
  });

  it("lets an administrator reassign custody to a current workspace member", async () => {
    mocks.reassignSavedMeetingOwner.mockResolvedValue("updated");

    const response = await client.meetings[":id"].share.owner.$post({
      json: { userId: "new-owner" },
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(200);
    expect(mocks.reassignSavedMeetingOwner).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      memberRole: "admin",
      organizationId: "org-72",
      targetUserId: "new-owner",
      userId: "user-72",
    });
  });

  it("rejects owner reassignment while the current owner is still a workspace member", async () => {
    mocks.reassignSavedMeetingOwner.mockResolvedValue("not-custodied");

    const response = await client.meetings[":id"].share.owner.$post({
      json: { userId: "new-owner" },
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(409);
  });

  it("returns the explicit workspace transcription provider policy", async () => {
    mocks.getWorkspaceMeetingTranscriptionPolicy.mockResolvedValue({
      allowedProviders: ["openai"],
      availableProviders: [
        {
          id: "openai",
          label: "OpenAI candidate",
          model: "gpt-4o-transcribe-diarize",
          region: "openai-default",
        },
      ],
      canManage: true,
      fallbackProvider: null,
      revision: 1,
      selectedProvider: "openai",
      selectionReason: "同一授权语料评测后选择 OpenAI。",
    });

    const response = await client.meetings["transcription-policy"].$get();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ selectedProvider: "openai" });
  });

  it("creates an ephemeral live transcript authorization for the active workspace member", async () => {
    mocks.createWorkspaceMeetingLiveTranscriptAuthorization.mockResolvedValue({
      clientSecret: "ephemeral-77",
      expiresAt: "2026-08-09T01:21:00.000Z",
      model: "gpt-4o-mini-transcribe",
      provider: "openai",
      track: "microphone",
    });

    const response = await client.meetings["live-transcript"].$post({
      json: {
        captureId: "00000000-0000-4000-8000-000000000077",
        track: "microphone",
      },
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      clientSecret: "ephemeral-77",
      provider: "openai",
      track: "microphone",
    });
    expect(mocks.createWorkspaceMeetingLiveTranscriptAuthorization).toHaveBeenCalledWith({
      captureId: "00000000-0000-4000-8000-000000000077",
      organizationId: "org-72",
      track: "microphone",
      userId: "user-72",
    });
  });

  it("returns a DashScope temp-token authorization when the workspace live provider is qwen", async () => {
    mocks.createWorkspaceMeetingLiveTranscriptAuthorization.mockResolvedValue({
      baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      clientSecret: "st-temp-token-77",
      expiresAt: "2026-08-09T01:21:00.000Z",
      model: "qwen3-asr-flash-realtime",
      provider: "qwen",
      track: "system",
    });

    const response = await client.meetings["live-transcript"].$post({
      json: {
        captureId: "00000000-0000-4000-8000-000000000077",
        track: "system",
      },
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      clientSecret: "st-temp-token-77",
      model: "qwen3-asr-flash-realtime",
      provider: "qwen",
      track: "system",
    });
  });

  it("returns a bounded retry window when live authorization is rate limited", async () => {
    mocks.createWorkspaceMeetingLiveTranscriptAuthorization.mockRejectedValue(
      new LiveTranscriptAuthorizationRateLimitError(42),
    );

    const response = await client.meetings["live-transcript"].$post({
      json: {
        captureId: "00000000-0000-4000-8000-000000000077",
        track: "microphone",
      },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
  });

  it("returns an explicit local-recording-safe state when live capacity is full", async () => {
    mocks.createWorkspaceMeetingLiveTranscriptAuthorization.mockResolvedValue("capacity");

    const response = await client.meetings["live-transcript"].$post({
      json: {
        captureId: "00000000-0000-4000-8000-000000000077",
        track: "microphone",
      },
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      code: "live-transcript-capacity-exhausted",
      error: "实时字幕容量已满，Meeting Recording 仍在本地继续",
    });
  });

  it("updates provider policy through an administrator-only route", async () => {
    mocks.updateWorkspaceMeetingTranscriptionPolicy.mockResolvedValue({
      allowedProviders: ["openai"],
      availableProviders: [],
      canManage: true,
      fallbackProvider: null,
      revision: 2,
      selectedProvider: "openai",
      selectionReason: "同一授权语料评测后选择 OpenAI。",
    });

    const response = await client.meetings["transcription-policy"].$put({
      json: {
        allowedProviders: ["openai"],
        fallbackProvider: null,
        selectedProvider: "openai",
        selectionReason: "同一授权语料评测后选择 OpenAI。",
      },
    });

    expect(response.status).toBe(200);
    expect(mocks.updateWorkspaceMeetingTranscriptionPolicy).toHaveBeenCalledWith({
      memberRole: "admin",
      organizationId: "org-72",
      policy: {
        allowedProviders: ["openai"],
        fallbackProvider: null,
        selectedProvider: "openai",
        selectionReason: "同一授权语料评测后选择 OpenAI。",
      },
      userId: "user-72",
    });
  });

  it("returns a speaker-attributed final transcript after meeting authorization", async () => {
    mocks.getSavedMeetingTranscript.mockResolvedValue({
      error: null,
      revision: {
        createdAt: "2026-08-09T08:00:00.000Z",
        id: "revision-76",
        kind: "final",
        language: "zh",
        model: "gpt-4o-transcribe-diarize",
        provider: "openai",
        region: "openai-default",
        revision: 1,
        turns: [
          {
            confidence: null,
            endMs: 2000,
            id: "turn-76",
            sequence: 0,
            speakerKey: "local",
            startMs: 1000,
            text: "你好",
            track: "local",
          },
        ],
      },
      state: "ready",
    });

    const response = await client.meetings[":id"].transcript.$get({
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      revision: { turns: [{ speakerKey: "local", startMs: 1000 }] },
      state: "ready",
    });
  });

  it("creates a human transcript revision and exposes revision history", async () => {
    const correction = {
      language: "zh",
      sourceRevisionId: "00000000-0000-4000-8000-000000000076",
      turns: [
        {
          confidence: null,
          endMs: 2000,
          speakerDisplayName: "面试官",
          speakerKey: "local",
          startMs: 1000,
          text: "人工修正",
          track: "local" as const,
        },
      ],
    };
    mocks.correctSavedMeetingTranscript.mockResolvedValue({
      basedOnRevisionId: correction.sourceRevisionId,
      id: "revision-human-78",
      kind: "human",
      revision: 2,
      turns: correction.turns,
    });
    mocks.getSavedMeetingTranscriptHistory.mockResolvedValue({
      records: [{ id: "revision-human-78", kind: "human", revision: 2 }],
    });

    const correctionResponse = await client.meetings[":id"].transcript.corrections.$post({
      json: correction,
      param: { id: MEETING_ID },
    });
    expect(correctionResponse.status).toBe(201);
    expect(mocks.correctSavedMeetingTranscript).toHaveBeenCalledWith({
      correction,
      meetingId: MEETING_ID,
      memberRole: "admin",
      organizationId: "org-72",
      userId: "user-72",
    });

    const historyResponse = await client.meetings[":id"].transcript.revisions.$get({
      param: { id: MEETING_ID },
    });
    expect(historyResponse.status).toBe(200);
    expect(await historyResponse.json()).toMatchObject({
      records: [{ id: "revision-human-78", revision: 2 }],
    });

    mocks.getSavedMeetingTranscriptRevision.mockResolvedValue({
      id: "revision-human-78",
      kind: "human",
      revision: 2,
      turns: correction.turns,
    });
    const revisionResponse = await client.meetings[":id"].transcript.revisions[":revisionId"].$get({
      param: { id: MEETING_ID, revisionId: "revision-human-78" },
    });
    expect(revisionResponse.status).toBe(200);
    expect(await revisionResponse.json()).toMatchObject({
      id: "revision-human-78",
      turns: [{ speakerDisplayName: "面试官" }],
    });
  });

  it("returns a detectable conflict for a stale transcript correction", async () => {
    mocks.correctSavedMeetingTranscript.mockResolvedValue("conflict");

    const response = await client.meetings[":id"].transcript.corrections.$post({
      json: {
        language: "zh",
        sourceRevisionId: "00000000-0000-4000-8000-000000000076",
        turns: [],
      },
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "会议转录已被其他人更新，请刷新后重试",
    });
  });

  it("rejects an oversized transcript correction before parsing JSON", async () => {
    const response = await makeApp().request(`/meetings/${MEETING_ID}/transcript/corrections`, {
      body: "{}",
      headers: {
        "content-length": String(9 * 1024 * 1024),
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "会议转录修订请求过大" });
    expect(mocks.correctSavedMeetingTranscript).not.toHaveBeenCalled();
  });
});
