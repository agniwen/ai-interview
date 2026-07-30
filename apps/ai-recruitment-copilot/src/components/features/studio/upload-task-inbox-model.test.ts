import { describe, expect, it } from "vitest";
import { getUploadTaskStatusMeta } from "./upload-task-inbox-model";

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
});
