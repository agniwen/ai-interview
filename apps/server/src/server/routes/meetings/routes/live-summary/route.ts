import { zValidator } from "@hono/zod-validator";
import { meetingLiveSummaryRequestSchema } from "@app/shared/meeting-live-summary";
import { factory, jsonValidatorError } from "../../../../factory";
import { defaultGenerateLiveMeetingSummary } from "./application/default-generate-live-meeting-summary";

export interface MeetingLiveSummaryRouterDependencies {
  generate: typeof defaultGenerateLiveMeetingSummary;
}

const defaultDependencies: MeetingLiveSummaryRouterDependencies = {
  generate: defaultGenerateLiveMeetingSummary,
};

export function createMeetingLiveSummaryRouter(
  overrides: Partial<MeetingLiveSummaryRouterDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };
  return factory
    .createApp()
    .post(
      "/",
      zValidator(
        "json",
        meetingLiveSummaryRequestSchema,
        jsonValidatorError("AI 实时总结请求无效"),
      ),
      async (c) => {
        c.header("Cache-Control", "no-store");
        const { activeOrg, member, user } = c.var;
        if (!(activeOrg && member && user)) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        try {
          const request = c.req.valid("json");
          const result = await dependencies.generate(request);
          return c.json(result, 200);
        } catch (error) {
          console.error("[meeting-live-summary] generation failed", {
            captureId: c.req.valid("json").captureId,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
          c.header("Retry-After", "60");
          return c.json({ error: "AI 实时总结暂时不可用，录音仍在继续" }, 503);
        }
      },
    );
}

export const meetingLiveSummaryRouter = createMeetingLiveSummaryRouter();
