import { describe, expect, it } from "vitest";

import { getPublishedJobDescriptionSummary } from "../resume-pool-job-binding-menu";

describe("getPublishedJobDescriptionSummary", () => {
  it("handles a compact cached job record without a prompt", () => {
    expect(getPublishedJobDescriptionSummary({ prompt: undefined })).toBe("暂无岗位描述。");
  });
});
