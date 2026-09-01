import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "../../../../factory";
import {
  meetingAudioExportTrackSchema,
  meetingExportFormatSchema,
} from "@arc/shared/meeting-export";
import { z } from "zod";
import { prepareMeetingExport } from "./service";

const exportParamSchema = z.object({ format: meetingExportFormatSchema });
const exportQuerySchema = z.object({ track: meetingAudioExportTrackSchema.optional() });

export interface MeetingExportsDependencies {
  prepareMeetingExport: typeof prepareMeetingExport;
}

const defaultDependencies: MeetingExportsDependencies = { prepareMeetingExport };

export function createMeetingExportsRouter(
  dependencies: MeetingExportsDependencies = defaultDependencies,
) {
  return factory
    .createApp()
    .get(
      "/:format",
      zValidator("param", exportParamSchema, jsonValidatorError("导出格式无效")),
      zValidator("query", exportQuerySchema, jsonValidatorError("导出音轨无效")),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!(activeOrg && user)) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const meetingId = c.req.param("id");
        if (!meetingId) {
          return c.json({ error: "Meeting Session 不存在" }, 404);
        }
        const result = await dependencies.prepareMeetingExport({
          audioTrack: c.req.valid("query").track,
          format: c.req.valid("param").format,
          meetingId,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        if (result.kind === "not-found") {
          return c.json({ error: "Meeting Session 不存在" }, 404);
        }
        if (result.kind === "forbidden") {
          return c.json({ error: "无权导出该会议" }, 403);
        }
        if (result.kind === "not-ready") {
          return c.json({ error: "会议导出资产尚未就绪" }, 409);
        }
        if (result.kind === "failed") {
          return c.json({ error: "生成会议导出失败" }, 500);
        }
        if (result.kind === "audio") {
          return c.redirect(result.url, 302);
        }
        if (result.kind !== "text") {
          return c.json({ error: "生成会议导出失败" }, 500);
        }
        const encodedFilename = encodeURIComponent(result.filename);
        return new Response(result.body, {
          headers: {
            "Content-Disposition": `attachment; filename="meeting-export"; filename*=UTF-8''${encodedFilename}`,
            "Content-Type": result.contentType,
            "X-Content-Type-Options": "nosniff",
          },
          status: 200,
        });
      },
    );
}

export const meetingExportsRouter = createMeetingExportsRouter();
