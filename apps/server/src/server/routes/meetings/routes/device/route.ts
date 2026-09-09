import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { factory, jsonValidatorError } from "../../../../factory";
import type { Env } from "../../../../type";
import {
  echoArtifactRequestSchema,
  echoDeviceEpochSchema,
  echoIntelligenceStepSchema,
  echoPollTranscriptionSchema,
  echoSubmitTranscriptionSchema,
  echoSyncIntelligenceSchema,
  echoSyncTranscriptSchema,
} from "@app/shared/meeting-device-processing";
import {
  adoptEchoDeviceProcessing,
  generateEchoIntelligenceStep,
  getEchoDeviceContext,
  planEchoArtifact,
  pollEchoTranscription,
  submitEchoTranscription,
  synchronizeEchoIntelligence,
  synchronizeEchoPlayback,
  synchronizeEchoTranscript,
} from "./service";
import { echoSourcePlanSchema, planEchoSources, completeEchoSources } from "./source-service";
import { getEchoDeletionState, requestEchoDeletion, advanceEchoDeletion } from "./purge-service";
import {
  startEchoQuestion,
  generateEchoQuestion,
  synchronizeEchoQuestion,
  echoQuestionStartSchema,
  echoQuestionGenerateSchema,
  echoQuestionSyncSchema,
} from "./question-service";
import { EchoProcessingError } from "./error";

function actor(c: Context<Env>, epoch = 1) {
  const { activeOrg, member, user } = c.var;
  const meetingId = c.req.param("id");
  const deviceId = z.uuid().safeParse(c.req.header("X-Echo-Device-Id"));
  if (
    !(activeOrg && member && user && deviceId.success) ||
    c.req.header("X-Echo-Account-Id") !== user.id ||
    c.req.header("X-Echo-Workspace-Id") !== activeOrg.id
  ) {
    throw new EchoProcessingError(403, "请在 Echo 中登录当前账号后处理");
  }
  if (!meetingId) {
    throw new EchoProcessingError(404, "Meeting Session 不存在");
  }
  return {
    deviceId: deviceId.data,
    epoch,
    meetingId,
    organizationId: activeOrg.id,
    userId: user.id,
  };
}
const adoptSchema = echoDeviceEpochSchema.extend({ regenerate: z.boolean().optional() });

export const meetingDeviceRouter = factory
  .createApp()
  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Hono requires a synchronous error response callback.
  .onError((error, c) => {
    if (error instanceof EchoProcessingError) {
      return c.json({ error: error.message }, error.status);
    }
    throw error;
  })
  .get("/deletion", async (c) => c.json(await getEchoDeletionState(actor(c)), 200))
  .post("/deletion", async (c) => c.json(await requestEchoDeletion(actor(c)), 200))
  .post("/deletion/step", async (c) => c.json(await advanceEchoDeletion(actor(c)), 200))
  .get("/", async (c) => c.json(await getEchoDeviceContext(actor(c)), 200))
  .post(
    "/adopt",
    zValidator("json", adoptSchema, jsonValidatorError("接手请求无效")),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(
        await adoptEchoDeviceProcessing({ ...actor(c, input.epoch), regenerate: input.regenerate }),
        200,
      );
    },
  )
  .post(
    "/sources",
    zValidator("json", echoSourcePlanSchema, jsonValidatorError("录音清单无效")),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(await planEchoSources({ ...actor(c, input.epoch), ...input }), 200);
    },
  )
  .post(
    "/sources/complete",
    zValidator(
      "json",
      echoDeviceEpochSchema.extend({ manifestSha256: z.string() }),
      jsonValidatorError("录音校验请求无效"),
    ),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(await completeEchoSources({ ...actor(c, input.epoch), ...input }), 200);
    },
  )
  .post(
    "/questions/start",
    zValidator("json", echoQuestionStartSchema, jsonValidatorError("提问无效")),
    async (c) => c.json(await startEchoQuestion({ ...actor(c), ...c.req.valid("json") }), 200),
  )
  .post(
    "/questions/generate",
    zValidator("json", echoQuestionGenerateSchema, jsonValidatorError("提问生成请求无效")),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(await generateEchoQuestion({ ...actor(c, input.epoch), ...input }), 200);
    },
  )
  .post(
    "/questions/sync",
    zValidator("json", echoQuestionSyncSchema, jsonValidatorError("回答同步请求无效")),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(await synchronizeEchoQuestion({ ...actor(c, input.epoch), ...input }), 200);
    },
  )
  .post(
    "/artifacts",
    zValidator("json", echoArtifactRequestSchema, jsonValidatorError("音频产物无效")),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(await planEchoArtifact({ ...actor(c, input.epoch), ...input }), 200);
    },
  )
  .post(
    "/transcription/submit",
    zValidator("json", echoSubmitTranscriptionSchema, jsonValidatorError("转写请求无效")),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(await submitEchoTranscription({ ...actor(c, input.epoch), ...input }), 200);
    },
  )
  .post(
    "/transcription/poll",
    zValidator("json", echoPollTranscriptionSchema, jsonValidatorError("转写查询无效")),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(await pollEchoTranscription({ ...actor(c, input.epoch), ...input }), 200);
    },
  )
  .post(
    "/intelligence/step",
    zValidator("json", echoIntelligenceStepSchema, jsonValidatorError("纪要请求无效")),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(
        await generateEchoIntelligenceStep({ ...actor(c, input.epoch), ...input }),
        200,
      );
    },
  )
  .post(
    "/sync/transcript",
    zValidator("json", echoSyncTranscriptSchema, jsonValidatorError("转录同步无效")),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(await synchronizeEchoTranscript({ ...actor(c, input.epoch), ...input }), 200);
    },
  )
  .post(
    "/sync/intelligence",
    zValidator("json", echoSyncIntelligenceSchema, jsonValidatorError("纪要同步无效")),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(await synchronizeEchoIntelligence({ ...actor(c, input.epoch), ...input }), 200);
    },
  )
  .post(
    "/sync/playback",
    zValidator("json", echoArtifactRequestSchema, jsonValidatorError("回放同步无效")),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(await synchronizeEchoPlayback({ ...actor(c, input.epoch), ...input }), 200);
    },
  );
