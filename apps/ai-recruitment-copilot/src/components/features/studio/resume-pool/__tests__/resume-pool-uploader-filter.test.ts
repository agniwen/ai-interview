import { describe, expect, it } from "vitest";
import {
  buildResumePoolUploaderFilterOptions,
  createResumePoolFilters,
  getResumePoolUploaderFilterAvailability,
  isResumePoolUploaderFilterDisabled,
  normalizeResumePoolUploaderId,
  RESUME_POOL_LOAD_MORE_ROOT_MARGIN,
  RESUME_POOL_UPLOADER_QUERY_FRESHNESS,
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

  it("starts loading the next page before the footer reaches the viewport", () => {
    expect(RESUME_POOL_LOAD_MORE_ROOT_MARGIN).toBe("720px 0px");
  });

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

  it("always refreshes uploader options when the page mounts", () => {
    expect(RESUME_POOL_UPLOADER_QUERY_FRESHNESS).toEqual({
      refetchOnMount: "always",
      staleTime: 0,
    });
  });

  it("does not show a stale self-only tooltip while uploader options refresh", () => {
    expect(
      getResumePoolUploaderFilterAvailability({
        isFetching: true,
        isSuccess: true,
        uploaders: uploaders.slice(0, 1),
      }),
    ).toEqual({ disabled: true, disabledReason: undefined });

    expect(
      getResumePoolUploaderFilterAvailability({
        isFetching: false,
        isSuccess: true,
        uploaders: uploaders.slice(0, 1),
      }),
    ).toEqual({ disabled: true, disabledReason: "当前仅可查看自己的数据" });
  });

  it("keeps a valid uploader id in route search and drops invalid values", () => {
    expect(normalizeResumePoolUploaderId(" report ")).toBe("report");
    expect(normalizeResumePoolUploaderId(123)).toBeUndefined();
    expect(normalizeResumePoolUploaderId(" ")).toBeUndefined();
  });
});
