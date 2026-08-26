import { describe, expect, it } from "vitest";
import {
  buildInterviewNotificationDedupeKey,
  classifyInterviewNotificationFailure,
  extractInterviewNotificationTemplateVariables,
  getInterviewNotificationRetryAt,
  InterviewNotificationProviderError,
  interviewNotificationPayloadSnapshotSchema,
  renderInterviewNotificationTemplate,
} from "../interview-notifications";

describe("interview notification contracts", () => {
  it("builds stable versioned dedupe keys", () => {
    expect(
      buildInterviewNotificationDedupeKey({
        scopeId: "meeting_1",
        type: "human_interview_rescheduled",
        version: 3,
      }),
    ).toBe("human_interview_rescheduled:meeting_1:3");
    expect(
      buildInterviewNotificationDedupeKey({
        discriminator: 60,
        scopeId: "meeting_1",
        type: "human_interview_reminder",
        version: 3,
      }),
    ).toBe("human_interview_reminder:meeting_1:3:60");
  });

  it("rejects invalid dedupe key inputs", () => {
    expect(() =>
      buildInterviewNotificationDedupeKey({
        scopeId: " ",
        type: "ai_report_ready",
        version: 1,
      }),
    ).toThrow("通知去重键参数无效");
    expect(() =>
      buildInterviewNotificationDedupeKey({
        scopeId: "conversation_1",
        type: "ai_report_ready",
        version: 0,
      }),
    ).toThrow("通知去重键参数无效");
  });

  it("uses the confirmed 1, 5, and 15 minute retry schedule", () => {
    const now = new Date("2026-08-20T00:00:00.000Z");
    expect(getInterviewNotificationRetryAt(1, now)?.toISOString()).toBe("2026-08-20T00:01:00.000Z");
    expect(getInterviewNotificationRetryAt(2, now)?.toISOString()).toBe("2026-08-20T00:05:00.000Z");
    expect(getInterviewNotificationRetryAt(3, now)?.toISOString()).toBe("2026-08-20T00:15:00.000Z");
    expect(getInterviewNotificationRetryAt(4, now)).toBeNull();
  });

  it("extracts, validates, deduplicates, and sorts template variables", () => {
    expect(
      extractInterviewNotificationTemplateVariables(
        "{{candidateName}} 的 {{roundName}} 已改期",
        "新时间：{{ interviewStartTime }}，候选人：{{candidateName}}",
      ),
    ).toEqual(["candidateName", "interviewStartTime", "roundName"]);
    expect(() => extractInterviewNotificationTemplateVariables("{{internalEvaluation}}")).toThrow(
      "通知模板包含不支持的变量：internalEvaluation",
    );
    expect(() => extractInterviewNotificationTemplateVariables("{{internal_evaluation}}")).toThrow(
      "通知模板包含不支持的变量：internal_evaluation",
    );
  });

  it("requires a versioned payload and time zone", () => {
    expect(
      interviewNotificationPayloadSnapshotSchema.parse({
        candidateName: "候选人",
        schemaVersion: 1,
        timeZone: "Asia/Shanghai",
      }),
    ).toMatchObject({ schemaVersion: 1, timeZone: "Asia/Shanghai" });
    expect(
      interviewNotificationPayloadSnapshotSchema.safeParse({
        candidateName: "候选人",
        schemaVersion: 1,
        timeZone: "",
      }).success,
    ).toBe(false);
  });

  it("renders only allowlisted payload variables", () => {
    expect(
      renderInterviewNotificationTemplate(
        "{{candidateName}} 的面试官：{{interviewerNames}}，备注：{{changeReason}}",
        {
          candidateName: "张三",
          interviewerNames: ["李四", "王五"],
          schemaVersion: 1,
          timeZone: "Asia/Shanghai",
        },
      ),
    ).toBe("张三 的面试官：李四、王五，备注：");
    expect(() =>
      renderInterviewNotificationTemplate("{{internalEvaluation}}", {
        schemaVersion: 1,
        timeZone: "Asia/Shanghai",
      }),
    ).toThrow("通知模板包含不支持的变量");
  });

  it("keeps unknown provider outcomes separate from retryable failures", () => {
    expect(classifyInterviewNotificationFailure(new Error("socket closed"))).toMatchObject({
      code: "provider-result-unknown",
      kind: "unknown",
    });
    expect(
      classifyInterviewNotificationFailure(
        new InterviewNotificationProviderError({
          code: "provider-rate-limited",
          kind: "retryable",
          message: "请求过于频繁",
        }),
      ),
    ).toEqual({
      code: "provider-rate-limited",
      kind: "retryable",
      message: "请求过于频繁",
    });
  });
});
