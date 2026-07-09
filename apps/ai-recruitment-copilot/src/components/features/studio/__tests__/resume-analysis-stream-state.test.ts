import { describe, expect, it } from "vitest";
import {
  appendUniqueStreamDelta,
  getCompletedProgressToolName,
  profilePreviewToPartialFields,
  rememberProgressStepLabel,
  upsertOcrPageProgress,
  upsertOcrPagePreview,
  upsertProgressTool,
} from "../resume-analysis-stream-state";

describe("resume analysis stream state helpers", () => {
  it("does not append an AiRunEvent delta that was already emitted as legacy text", () => {
    expect(appendUniqueStreamDelta("候选人匹配", "匹配")).toBe("候选人匹配");
  });

  it("appends new stream delta text", () => {
    expect(appendUniqueStreamDelta("候选人", "匹配")).toBe("候选人匹配");
  });

  it("deduplicates progress tools by display name and marks them complete", () => {
    const started = upsertProgressTool([], "OCR 识别简历", false);
    expect(upsertProgressTool(started, "OCR 识别简历", false)).toEqual(started);
    expect(upsertProgressTool(started, "OCR 识别简历", true)).toEqual([
      { done: true, name: "OCR 识别简历" },
    ]);
  });

  it("completes Mastra workflow steps by the display label captured on start", () => {
    const labels = rememberProgressStepLabel({}, "structure-resume", "提取结构化字段");

    expect(
      getCompletedProgressToolName(
        {
          runId: "run-1",
          stepId: "structure-resume",
          type: "step.completed",
        },
        labels,
      ),
    ).toBe("提取结构化字段");
  });

  it("tracks OCR page progress without requiring sequential completion", () => {
    const running = upsertOcrPageProgress([], {
      kind: "ocr-page",
      page: 2,
      status: "running",
      totalPages: 3,
    });

    expect(running).toEqual([
      { page: 1, status: "queued", totalPages: 3 },
      { page: 2, status: "running", totalPages: 3 },
      { page: 3, status: "queued", totalPages: 3 },
    ]);

    expect(
      upsertOcrPageProgress(running, {
        charCount: 120,
        kind: "ocr-page",
        page: 2,
        status: "completed",
        totalPages: 3,
      }),
    ).toEqual([
      { page: 1, status: "queued", totalPages: 3 },
      { charCount: 120, page: 2, status: "completed", totalPages: 3 },
      { page: 3, status: "queued", totalPages: 3 },
    ]);
  });

  it("stores sanitized OCR page preview on the matching page", () => {
    const pages = upsertOcrPagePreview([], {
      charCount: 48,
      page: 1,
      textPreview: "候选人电话 13800000000，邮箱 candidate@example.com，擅长 React",
      totalPages: 1,
    });

    expect(pages).toEqual([
      {
        charCount: 48,
        page: 1,
        status: "completed",
        textPreview: "候选人电话 138****0000，邮箱 c***@example.com，擅长 React",
        totalPages: 1,
      },
    ]);
  });

  it("converts structured resume preview into partial fields", () => {
    expect(
      profilePreviewToPartialFields({
        name: "候选人",
        schools: ["浙江大学"],
        skills: ["React", "TypeScript", "Node.js"],
        targetRoles: ["前端工程师"],
        workYears: 5,
      }),
    ).toEqual([
      { label: "姓名", value: "候选人" },
      { label: "目标岗位", value: "前端工程师" },
      { label: "技能", value: "React、TypeScript、Node.js" },
      { label: "院校", value: "浙江大学" },
      { label: "工作年限", value: "5" },
    ]);
  });
});
