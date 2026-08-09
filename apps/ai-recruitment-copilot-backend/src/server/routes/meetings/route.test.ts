import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { LiveTranscriptAuthorizationRateLimitError } from "./routes/live-transcript/authorization-gate";

const mocks = vi.hoisted(() => ({
  addMeetingNote: vi.fn(),
  changeMeetingRecruitingContext: vi.fn(),
  completeSmallSavedMeeting: vi.fn(),
  correctSavedMeetingTranscript: vi.fn(),
  createMeetingPlaybackAuthorization: vi.fn(),
  createMultipartSavedMeeting: vi.fn(),
  createSmallSavedMeeting: vi.fn(),
  createWorkspaceMeetingLiveTranscriptAuthorization: vi.fn(),
  editMeetingNote: vi.fn(),
  getMeetingNotes: vi.fn(),
  getMeetingRecruitingContext: vi.fn(),
  getMeetingRecruitingRecordCandidates: vi.fn(),
  getMeetingShareSettings: vi.fn(),
  getSavedMeetingDetail: vi.fn(),
  getSavedMeetingTranscript: vi.fn(),
  getSavedMeetingTranscriptHistory: vi.fn(),
  getSavedMeetingTranscriptRevision: vi.fn(),
  getWorkspaceMeetingTranscriptionPolicy: vi.fn(),
  listSavedMeetings: vi.fn(),
  reassignSavedMeetingOwner: vi.fn(),
  removeMeetingNote: vi.fn(),
  retryMeetingPlayback: vi.fn(),
  retrySavedMeetingTranscription: vi.fn(),
  updateMeetingShare: vi.fn(),
  updateWorkspaceMeetingTranscriptionPolicy: vi.fn(),
}));

vi.mock("./service", () => mocks);
vi.mock("./collaboration-service", () => mocks);
vi.mock("./transcription/service", () => mocks);
vi.mock("./routes/live-transcript/service", () => mocks);
vi.mock("./recruiting-context-service", () => mocks);
vi.mock("@arc/ai-recruitment-copilot-backend/server/access/workspace-access-policy", () => ({
  createRequestWorkspaceAuthorizer: () => () => Promise.resolve(true),
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import { meetingsRouter } from "./route";

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

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("activeOrg", { id: "org-72" } as never);
      c.set("member", { role: "admin" } as never);
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
      revision: 1,
      selectedProvider: "openai",
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

  it("updates provider policy through an administrator-only route", async () => {
    mocks.updateWorkspaceMeetingTranscriptionPolicy.mockResolvedValue({
      allowedProviders: ["openai"],
      availableProviders: [],
      canManage: true,
      revision: 2,
      selectedProvider: "openai",
    });

    const response = await client.meetings["transcription-policy"].$put({
      json: { allowedProviders: ["openai"], selectedProvider: "openai" },
    });

    expect(response.status).toBe(200);
    expect(mocks.updateWorkspaceMeetingTranscriptionPolicy).toHaveBeenCalledWith({
      memberRole: "admin",
      organizationId: "org-72",
      policy: { allowedProviders: ["openai"], selectedProvider: "openai" },
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
