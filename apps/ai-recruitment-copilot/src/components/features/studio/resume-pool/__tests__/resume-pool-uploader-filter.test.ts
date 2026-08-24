import { describe, expect, it } from "vitest";
import {
  buildResumePoolUploaderFilterOptions,
  createResumePoolFilters,
  filterPoolRecords,
  groupResumePoolRecordsByCreatedAt,
  resumePoolCreatedAtBounds,
  resumePoolCreatedAtRangeLabel,
  uploaderMetaLabel,
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
      createdAtRange: "",
      importStatus: "",
      sourceType: "all",
      uploaderIds: "",
    });
  });

  it("resolves quick and custom ranges in the app timezone", () => {
    const now = new Date("2026-08-14T16:30:00.000Z");

    expect(resumePoolCreatedAtBounds("today", now)).toEqual({
      from: "2026-08-15",
      to: "2026-08-15",
    });
    expect(resumePoolCreatedAtBounds("yesterday", now)).toEqual({
      from: "2026-08-14",
      to: "2026-08-14",
    });
    expect(resumePoolCreatedAtBounds("last_7_days", now)).toEqual({
      from: "2026-08-09",
      to: "2026-08-15",
    });
    expect(resumePoolCreatedAtBounds("custom:2026-08-01:2026-08-08", now)).toEqual({
      from: "2026-08-01",
      to: "2026-08-08",
    });
    expect(resumePoolCreatedAtBounds("custom:2026-08-08:2026-08-01", now)).toBeNull();
    expect(resumePoolCreatedAtRangeLabel("custom:2026-08-01:2026-08-08")).toBe("8月1日–8月8日");
  });

  it("labels a referral with its referrer instead of calling it an upload", () => {
    // SAFETY: This test constructs the value with the asserted shape before this boundary.
    const record = {
      createdAt: "2026-08-14T16:00:00.000Z",
      id: "referral-record",
      sourceChannel: "referral",
      uploaderName: "张三",
    } as ResumePoolListRecord;

    expect(uploaderMetaLabel(record)).toContain("张三");
    expect(uploaderMetaLabel(record)).toContain("内推");
    expect(uploaderMetaLabel(record)).not.toContain("上传");
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
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
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

  it("groups created records by Shanghai calendar day", () => {
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    const records = [
      { createdAt: "2026-08-14T16:00:00.000Z", id: "today" },
      { createdAt: "2026-08-14T15:59:00.000Z", id: "yesterday" },
      { createdAt: "2026-08-13T12:00:00.000Z", id: "day-before-yesterday" },
      { createdAt: "2026-08-10T12:00:00.000Z", id: "earlier-this-month" },
      { createdAt: "2026-07-31T12:00:00.000Z", id: "july" },
    ] as ResumePoolListRecord[];

    expect(
      groupResumePoolRecordsByCreatedAt(records, new Date("2026-08-14T16:30:00.000Z")).map(
        (group) => ({
          ids: group.records.map((record) => record.id),
          label: group.label,
        }),
      ),
    ).toEqual([
      { ids: ["today"], label: "今天" },
      { ids: ["yesterday"], label: "昨天" },
      { ids: ["day-before-yesterday"], label: "前天" },
      { ids: ["earlier-this-month"], label: "本月更早" },
      { ids: ["july"], label: "2026 年 7 月" },
    ]);
  });
});
