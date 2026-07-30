import { describe, expect, it } from "vitest";
import { getUploadTaskPreviewTarget, getUploadTaskStatusMeta } from "./upload-task-inbox-model";

describe("upload task inbox model", () => {
  it("maps queue states to concise Chinese status metadata", () => {
    expect(getUploadTaskStatusMeta("waiting")).toMatchObject({
      label: "等待解析",
      tone: "pending",
    });
    expect(getUploadTaskStatusMeta("active")).toMatchObject({
      label: "解析中",
      tone: "processing",
    });
    expect(getUploadTaskStatusMeta("failed")).toMatchObject({
      label: "解析失败",
      tone: "failed",
    });
    expect(getUploadTaskStatusMeta("duplicate-skipped")).toMatchObject({
      label: "重复，已跳过",
      tone: "cancelled",
    });
  });

  it("maps talent-pool and recruitment-desk tasks to their existing preview resources", () => {
    expect(
      getUploadTaskPreviewTarget({
        originalFileName: "candidate.pdf",
        previewTarget: { id: "pool-1", resource: "resume-pool" },
      }),
    ).toEqual({
      id: "pool-1",
      kind: "pdf",
      path: "resume",
      resource: "resume-pool",
    });
    expect(
      getUploadTaskPreviewTarget({
        originalFileName: "candidate.docx",
        previewTarget: { id: "resume-1", resource: "resumes" },
      }),
    ).toEqual({
      id: "resume-1",
      kind: "docx",
      path: "resume",
      resource: "resumes",
    });
    expect(
      getUploadTaskPreviewTarget({
        originalFileName: "candidate.pptx",
        previewTarget: { id: "resume-2", resource: "resumes" },
      }),
    ).toEqual({
      id: "resume-2",
      kind: "pdf",
      path: "resume-preview.pdf",
      resource: "resumes",
    });
  });

  it("does not expose a preview when the backend record is unavailable", () => {
    expect(
      getUploadTaskPreviewTarget({
        originalFileName: "cancelled.pdf",
        previewTarget: null,
      }),
    ).toBeNull();
  });
});
