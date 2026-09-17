import { ipcMain } from "electron";
import { z } from "zod";
import { isTrustedMainFrame } from "../meeting-capture/ipc";
import { meetingIntelligenceTemplateSchema } from "@app/shared/meeting-intelligence";
import { localQuestionInputSchema } from "./question";
import type { EchoProcessingService } from "./service";

const meetingIdSchema = z.uuid();
export function registerEchoProcessingIpc(processing: EchoProcessingService): void {
  ipcMain.handle("echo-processing:local-questions", (event, input) => {
    if (!isTrustedMainFrame(event)) {
      throw new Error("不受信任的处理请求");
    }
    return processing.localQuestions(
      z
        .object({ accountId: z.string().min(1), meetingId: z.uuid(), threadId: z.string().min(1) })
        .parse(input),
    );
  });
  ipcMain.handle("echo-processing:context", (event, input) => {
    if (!isTrustedMainFrame(event)) {
      throw new Error("不受信任的处理请求");
    }
    return processing.context(
      z
        .object({
          accountId: z.string().min(1),
          meetingId: z.uuid(),
          workspaceId: z.string().min(1),
          workspaceSlug: z.string().min(1),
        })
        .parse(input),
    );
  });
  ipcMain.handle("echo-processing:regenerate", (event, input) => {
    if (!isTrustedMainFrame(event)) {
      throw new Error("不受信任的处理请求");
    }
    return processing.regenerate(
      z
        .object({
          accountId: z.string().min(1),
          meetingId: z.uuid(),
          template: meetingIntelligenceTemplateSchema,
          workspaceId: z.string().min(1),
          workspaceSlug: z.string().min(1),
        })
        .parse(input),
    );
  });
  ipcMain.handle("echo-processing:question", (event, input) => {
    if (!isTrustedMainFrame(event)) {
      throw new Error("不受信任的处理请求");
    }
    return processing.question(
      localQuestionInputSchema
        .extend({
          accountId: z.string().min(1),
          meetingId: z.uuid(),
          workspaceId: z.string().min(1),
          workspaceSlug: z.string().min(1),
        })
        .parse(input),
    );
  });
  ipcMain.handle("echo-processing:adopt", (event, input) => {
    if (!isTrustedMainFrame(event)) {
      throw new Error("不受信任的处理请求");
    }
    return processing.adopt(
      z
        .object({
          accountId: z.string().min(1),
          meetingId: z.uuid(),
          workspaceId: z.string().min(1),
          workspaceSlug: z.string().min(1),
        })
        .parse(input),
    );
  });
  ipcMain.handle("echo-processing:purge", (event, input) => {
    if (!isTrustedMainFrame(event)) {
      throw new Error("不受信任的处理请求");
    }
    return processing.requestPurge(
      z
        .object({
          accountId: z.string().min(1),
          meetingId: z.uuid(),
          workspaceId: z.string().min(1),
          workspaceSlug: z.string().min(1),
        })
        .parse(input),
    );
  });
  ipcMain.handle("echo-processing:status", (event, meetingId, accountId) => {
    if (!isTrustedMainFrame(event)) {
      throw new Error("不受信任的处理请求");
    }
    return processing.status(
      meetingIdSchema.parse(meetingId),
      z.string().optional().parse(accountId),
    );
  });
  ipcMain.handle("echo-processing:retry", (event, meetingId) => {
    if (!isTrustedMainFrame(event)) {
      throw new Error("不受信任的处理请求");
    }
    return processing.retry(meetingIdSchema.parse(meetingId));
  });
  ipcMain.handle("echo-processing:release-audio", (event, meetingId) => {
    if (!isTrustedMainFrame(event)) {
      throw new Error("不受信任的处理请求");
    }
    return processing.releaseAudio(meetingIdSchema.parse(meetingId));
  });
  ipcMain.handle("echo-processing:local-results", (event, meetingId, accountId) => {
    if (!isTrustedMainFrame(event)) {
      throw new Error("不受信任的处理请求");
    }
    return processing.localResults(
      meetingIdSchema.parse(meetingId),
      z.string().optional().parse(accountId),
    );
  });
}
