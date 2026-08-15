import { describe, expect, it } from "vitest";
import {
  buildResumePoolUploaderFilterOptions,
  createResumePoolFilters,
  filterPoolRecords,
  RESUME_POOL_LOAD_MORE_ROOT_MARGIN,
  RESUME_POOL_UPLOADER_QUERY_FRESHNESS,
} from "../resume-pool-page-model";
import type { ResumePoolListRecord } from "@arc/shared/resume-pool";

describe("resume pool uploader filter", () => {
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

  it("starts with no uploader selection", () => {
    expect(createResumePoolFilters()).toEqual({
      importStatus: "",
      sourceType: "all",
      uploaderIds: "",
    });
  });

  it("builds visible uploader choices without a synthetic all option", () => {
    expect(buildResumePoolUploaderFilterOptions(uploaders)).toEqual([
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

  it("always refreshes uploader options when the page mounts", () => {
    expect(RESUME_POOL_UPLOADER_QUERY_FRESHNESS).toEqual({
      refetchOnMount: "always",
      staleTime: 0,
    });
  });

  it("keeps records uploaded by any selected user", () => {
    const records = [
      { createdBy: "self", id: "self-record" },
      { createdBy: "report", id: "report-record" },
      { createdBy: "other", id: "other-record" },
      { createdBy: null, id: "unknown-record" },
    ] as ResumePoolListRecord[];

    expect(
      filterPoolRecords(records, {
        filters: { ...createResumePoolFilters(), uploaderIds: "self,report" },
        search: "",
        sortBy: undefined,
        sortOrder: undefined,
      }).map((record) => record.id),
    ).toEqual(["self-record", "report-record"]);
  });
});
