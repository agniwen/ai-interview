import { describe, expect, it } from "vitest";
import {
  buildResumePoolUploaderFilterOptions,
  createResumePoolFilters,
  isResumePoolUploaderFilterDisabled,
  normalizeResumePoolUploaderId,
} from "../resume-pool-page-model";

describe("private resume pool uploader filter", () => {
  const uploaders = [
    {
      email: "self@example.com",
      id: "self",
      image: "https://example.com/self.png",
      name: "当前用户",
    },
    { email: "report@example.com", id: "report", image: null, name: "下级成员" },
  ];

  it("defaults the private pool uploader to the current user", () => {
    expect(createResumePoolFilters("private", "self")).toEqual({
      importStatus: "",
      parseStatus: "",
      sourceType: "all",
      uploaderId: "self",
    });
  });

  it("does not apply an uploader filter to the public pool", () => {
    expect(createResumePoolFilters("public", "self").uploaderId).toBe("");
  });

  it("builds self, subordinate, and all-visible uploader choices", () => {
    expect(buildResumePoolUploaderFilterOptions(uploaders)).toEqual([
      { label: "全部上传人", value: "all" },
      {
        avatarUrl: "https://example.com/self.png",
        label: "当前用户",
        searchValue: "当前用户 self@example.com",
        value: "self",
      },
      {
        avatarUrl: null,
        label: "下级成员",
        searchValue: "下级成员 report@example.com",
        value: "report",
      },
    ]);
  });

  it("disables the uploader filter when the current user is the only option", () => {
    expect(isResumePoolUploaderFilterDisabled([])).toBe(true);
    expect(isResumePoolUploaderFilterDisabled(uploaders.slice(0, 1))).toBe(true);
    expect(isResumePoolUploaderFilterDisabled(uploaders)).toBe(false);
  });

  it("keeps a valid uploader id in route search and drops invalid values", () => {
    expect(normalizeResumePoolUploaderId(" report ")).toBe("report");
    expect(normalizeResumePoolUploaderId(123)).toBeUndefined();
    expect(normalizeResumePoolUploaderId(" ")).toBeUndefined();
  });
});
