import { getEchoDeletionState, requestEchoDeletion } from "./purge-service";
import { createMeetingPurgeDao } from "@app/meeting-processing/purge";
import { requestMeetingPurge, loadMeetingLocalRecoveryDirective } from "../../lifecycle-dao";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  meetingSession,
  meetingTranscriptRevision,
  member,
  organization,
  user,
} from "@app/db-schema/schema";
import { db } from "../../../../../lib/server/db";
import { createEchoContextDao } from "./context-dao";
import { createEchoRequestDao } from "./request-dao";
import { createEchoSyncDao } from "./sync-dao";
import type { EchoTranscript } from "@app/shared/meeting-device-processing";

const org = randomUUID();
const owner = randomUUID();
const stranger = randomUUID();
const meetingId = randomUUID();
const deviceId = randomUUID();
const actor = { deviceId, epoch: 1, meetingId, organizationId: org, userId: owner };
const contexts = createEchoContextDao(db);
const requests = createEchoRequestDao(db);
const sync = createEchoSyncDao(db);
const transcript: EchoTranscript = {
  language: "zh",
  model: "qwen-test",
  pipelineVersion: "test",
  provider: "qwen",
  region: "cn",
  revisionId: randomUUID(),
  turns: [
    {
      confidence: null,
      endMs: 1000,
      id: randomUUID(),
      speakerDisplayName: null,
      speakerKey: "system:0",
      startMs: 0,
      text: "我们周五交付",
      track: "remote",
    },
  ],
};
async function clean() {
  await db.delete(organization).where(eq(organization.id, org));
  await db.delete(user).where(eq(user.id, owner));
  await db.delete(user).where(eq(user.id, stranger));
}
beforeEach(async () => {
  await clean();
  await db.insert(user).values(
    [owner, stranger].map((id) => ({
      email: `${id}@example.test`,
      emailVerified: true,
      id,
      name: "Echo test",
    })),
  );
  await db
    .insert(organization)
    .values({ createdAt: new Date(), id: org, name: "Echo test", slug: org });
  await db.insert(member).values(
    [owner, stranger].map((id) => ({
      createdAt: new Date(),
      id: randomUUID(),
      organizationId: org,
      role: "member",
      userId: id,
    })),
  );
  await db.insert(meetingSession).values({
    id: meetingId,
    manifestSha256: "a".repeat(64),
    organizationId: org,
    ownerId: owner,
    processingAccountId: owner,
    processingDeviceId: deviceId,
    processingOwner: "device",
    savedAt: new Date(),
    startedAt: new Date(),
    status: "workspace-verified",
    title: "Echo integration",
    verifiedAt: new Date(),
  });
});
afterEach(clean);

describe("Echo device persistence", () => {
  it("lets shared readers reconcile deletion without granting delete permission and exposes due archive cleanup", async () => {
    const viewer = { ...actor, userId: stranger };
    await expect(getEchoDeletionState(viewer)).rejects.toThrow("无权查看");
    await db
      .update(meetingSession)
      .set({ visibility: "workspace" })
      .where(eq(meetingSession.id, meetingId));
    await expect(getEchoDeletionState(viewer)).resolves.toMatchObject({
      canAdvance: false,
      state: "retained",
    });
    await expect(requestEchoDeletion(viewer)).rejects.toThrow("无权永久删除");
    await db
      .update(meetingSession)
      .set({
        purgeAfter: new Date(0),
        status: "trashed",
        trashedAt: new Date(0),
        trashedFromStatus: "workspace-verified",
      })
      .where(eq(meetingSession.id, meetingId));
    await expect(getEchoDeletionState(actor)).resolves.toMatchObject({
      canAdvance: true,
      state: "purging",
    });
    await expect(getEchoDeletionState(viewer)).resolves.toMatchObject({
      canAdvance: false,
      state: "purging",
    });
  });

  it("serializes an ambiguous request and rejects changed inputs, accounts and devices", async () => {
    const input = {
      ...actor,
      kind: "test",
      operationId: randomUUID(),
      payload: { value: "original" },
    };
    const first = await requests.claim(input);
    expect(first.state).toBe("claimed");
    expect(await requests.claim(input)).toEqual({ state: "busy" });
    if (first.state !== "claimed") {
      throw new Error("missing claim");
    }
    await requests.complete({
      ...input,
      result: { providerTaskId: "persisted-task" },
      token: first.token,
    });
    expect(await requests.claim(input)).toEqual({
      result: { providerTaskId: "persisted-task" },
      state: "complete",
    });
    await expect(requests.claim({ ...input, payload: { value: "changed" } })).rejects.toThrow(
      "其他输入",
    );
    await expect(requests.claim({ ...input, userId: stranger })).rejects.toThrow("无权");
    await expect(requests.claim({ ...input, deviceId: randomUUID() })).rejects.toThrow(
      "原处理设备",
    );
  });

  it("adopts historical work idempotently and prevents another device from taking over unfinished work", async () => {
    await db
      .update(meetingSession)
      .set({ processingAccountId: null, processingDeviceId: null })
      .where(eq(meetingSession.id, meetingId));
    expect(await contexts.adopt(actor)).toEqual({ epoch: 2 });
    expect(await contexts.adopt(actor)).toEqual({ epoch: 2 });
    await expect(contexts.adopt({ ...actor, deviceId: randomUUID(), epoch: 2 })).rejects.toThrow(
      "原设备",
    );
  });

  it("requires verified source backup, synchronizes once, and fences edits and superseded devices", async () => {
    const input = {
      ...actor,
      expectedTranscriptRevisionId: null,
      operationId: randomUUID(),
      transcript,
    };
    await db
      .update(meetingSession)
      .set({ verifiedAt: null })
      .where(eq(meetingSession.id, meetingId));
    await expect(sync.transcript(input)).rejects.toThrow("源音频校验");
    await db
      .update(meetingSession)
      .set({ verifiedAt: new Date() })
      .where(eq(meetingSession.id, meetingId));
    expect(await sync.transcript(input)).toEqual({ revisionId: transcript.revisionId });
    expect(await sync.transcript(input)).toEqual({ revisionId: transcript.revisionId });
    const revision = await db.query.meetingTranscriptRevision.findFirst({
      where: { id: transcript.revisionId },
    });
    expect(revision?.revision).toBe(1);
    const correctionId = randomUUID();
    await db.insert(meetingTranscriptRevision).values({
      basedOnRevisionId: transcript.revisionId,
      id: correctionId,
      kind: "human",
      meetingId,
      model: "human",
      organizationId: org,
      pipelineVersion: "manual",
      provider: "human",
      region: "local",
      revision: 2,
      sourceManifestSha256: "a".repeat(64),
    });
    await db
      .update(meetingSession)
      .set({ activeTranscriptRevisionId: correctionId })
      .where(eq(meetingSession.id, meetingId));
    await expect(
      sync.transcript({
        ...input,
        expectedTranscriptRevisionId: transcript.revisionId,
        operationId: randomUUID(),
        transcript: { ...transcript, revisionId: randomUUID() },
      }),
    ).rejects.toThrow("已被更新");
    await db
      .update(meetingSession)
      .set({ processingEpoch: 2 })
      .where(eq(meetingSession.id, meetingId));
    await expect(sync.transcript(input)).rejects.toThrow("处理版本");
    const corrected = await db.query.meetingSession.findFirst({ where: { id: meetingId } });
    expect(corrected?.activeTranscriptRevisionId).toBe(correctionId);
  });

  it("synchronizes final intelligence into the document/mind-map projection and refuses stale revisions", async () => {
    await sync.transcript({
      ...actor,
      expectedTranscriptRevisionId: null,
      operationId: randomUUID(),
      transcript,
    });
    const input = {
      ...actor,
      content: {
        actionItems: [],
        decisions: [],
        openQuestions: [],
        summary: "周五交付",
        template: "general" as const,
        topics: [
          {
            evidenceTurnIds: [transcript.turns.map((turn) => turn.id)[0] ?? "missing"],
            summary: "周五交付",
            title: "交付",
          },
        ],
      },
      expectedIntelligenceRevisionId: null,
      generationOperationId: randomUUID(),
      model: "test",
      operationId: randomUUID(),
      provider: "mastra",
      transcriptRevisionId: transcript.revisionId,
    };
    const result = await sync.intelligence(input);
    expect(await sync.intelligence(input)).toEqual(result);
    const meeting = await db.query.meetingSession.findFirst({ where: { id: meetingId } });
    expect(meeting?.liveSummary).not.toBeNull();
    expect(meeting?.intelligenceStatus).toBe("ready");
    await expect(sync.intelligence({ ...input, operationId: randomUUID() })).rejects.toThrow(
      "已更新",
    );
  });
});

it("retains local data until bounded cloud cleanup is confirmed and then fences stale synchronization", async () => {
  const earlier = new Date(Date.now() - 3 * 60 * 60 * 1000);
  await requestMeetingPurge({ actorId: owner, meetingId, now: earlier, organizationId: org });
  expect(
    await loadMeetingLocalRecoveryDirective({
      actorId: owner,
      manifestSha256: "a".repeat(64),
      meetingId,
    }),
  ).toBe("retain");
  await expect(
    sync.transcript({
      ...actor,
      expectedTranscriptRevisionId: null,
      operationId: randomUUID(),
      transcript,
    }),
  ).rejects.toThrow("永久删除");
  const purge = createMeetingPurgeDao(db, "device");
  const first = await purge.claimMeetingPurge({ meetingId, organizationId: org });
  if (!first) {
    throw new Error("missing initial purge claim");
  }
  expect(first.phase).toBe("initial");
  expect(
    await purge.completeMeetingPurgeStorageBatch({
      executionToken: first.executionToken,
      meetingId,
      organizationId: org,
      phase: first.phase,
      storageCleanupKeys: first.storageCleanupKeys,
    }),
  ).toBe("quiet-period");
  expect(await purge.claimMeetingPurge({ meetingId, organizationId: org })).toBeNull();
  const final = await purge.claimMeetingPurge({
    meetingId,
    now: new Date(Date.now() + 62 * 60 * 1000),
    organizationId: org,
  });
  if (!final) {
    throw new Error("missing final purge claim");
  }
  expect(final.phase).toBe("final");
  expect(
    await purge.completeMeetingPurgeStorageBatch({
      executionToken: final.executionToken,
      meetingId,
      organizationId: org,
      phase: final.phase,
      storageCleanupKeys: final.storageCleanupKeys,
    }),
  ).toBe("ready");
  expect(
    await purge.finalizeMeetingPurge({
      executionToken: final.executionToken,
      meetingId,
      organizationId: org,
      providerCount: 0,
      storageObjectCount: 0,
    }),
  ).toBe(true);
  expect(
    await loadMeetingLocalRecoveryDirective({
      actorId: owner,
      manifestSha256: "a".repeat(64),
      meetingId,
    }),
  ).toBe("delete");
  await expect(
    sync.transcript({
      ...actor,
      expectedTranscriptRevisionId: null,
      operationId: randomUUID(),
      transcript,
    }),
  ).rejects.toThrow("不存在");
});
