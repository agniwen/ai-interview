import { z } from "zod";
import { finishHumanTranscription } from "./finish";
import { zValidator } from "@hono/zod-validator";
import {
  appendHumanTranscriptionSchema,
  humanTranscriptionCallbackSchema,
} from "@app/shared/human-transcription";
import { factory, jsonValidatorError } from "../../../../factory";
import type { appendHumanTranscriptionEvents, claimHumanTranscription } from "./dao";
import { HumanTranscriptionConflictError } from "./errors";

export interface HumanTranscriptionRouterDependencies {
  append: typeof appendHumanTranscriptionEvents;
  claim: typeof claimHumanTranscription;
}

export function createHumanTranscriptionRouter(dependencies: HumanTranscriptionRouterDependencies) {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      const expected = process.env.AGENT_CALLBACK_SECRET;
      if (!expected || c.req.header("X-Agent-Secret") !== expected) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      await next();
    })
    .post(
      "/:phase{ready|cutoff|finish}",
      zValidator(
        "json",
        humanTranscriptionCallbackSchema.extend({
          error: z.string().max(2000).nullable().optional(),
        }),
        jsonValidatorError("收尾任务无效"),
      ),
      async (c) => {
        const { error: reportedError, ...job } = c.req.valid("json");
        try {
          return c.json(
            await finishHumanTranscription(
              job,
              z.enum(["ready", "cutoff", "finish"]).parse(c.req.param("phase")),
              reportedError,
            ),
          );
        } catch (error) {
          if (error instanceof HumanTranscriptionConflictError) {
            return c.json({ error: error.message }, 409);
          }
          throw error;
        }
      },
    )
    .post(
      "/claim",
      zValidator("json", humanTranscriptionCallbackSchema, jsonValidatorError("转录任务无效")),
      async (c) => {
        try {
          return c.json(await dependencies.claim(c.req.valid("json")), 200);
        } catch (error) {
          if (error instanceof HumanTranscriptionConflictError) {
            return c.json({ error: error.message }, 409);
          }
          throw error;
        }
      },
    )
    .post(
      "/events",
      zValidator("json", appendHumanTranscriptionSchema, jsonValidatorError("转录事件无效")),
      async (c) => {
        const { events, ...job } = c.req.valid("json");
        try {
          return c.json(await dependencies.append(job, events), 200);
        } catch (error) {
          if (error instanceof HumanTranscriptionConflictError) {
            return c.json({ error: error.message }, 409);
          }
          throw error;
        }
      },
    );
}
