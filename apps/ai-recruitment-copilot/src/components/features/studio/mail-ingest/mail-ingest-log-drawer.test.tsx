// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderRunSummary } from "./mail-ingest-log-drawer";

describe("renderRunSummary", () => {
  const zero = {
    lastRunFailed: 0,
    lastRunMatched: 0,
    lastRunQueued: 0,
    lastRunReceived: 0,
    lastRunSubjectSkipped: 0,
  };

  it("never polled → 尚未轮询, no counts", () => {
    expect(renderRunSummary({ ...zero, lastCheckedAt: null, lastError: null })).toMatchObject({
      label: "尚未轮询",
      showCounts: false,
    });
  });

  it("checked + error + all-zero → 最近轮询失败, no counts, error passed", () => {
    const r = renderRunSummary({
      ...zero,
      lastCheckedAt: "2026-07-10T00:00:00.000Z",
      lastError: "IMAP down",
    });
    expect(r).toMatchObject({
      error: "IMAP down",
      label: "最近轮询失败，暂无成功快照",
      showCounts: false,
    });
  });

  it("has snapshot (nullable counts) → show counts", () => {
    const r = renderRunSummary({
      lastCheckedAt: "2026-07-10T00:00:00.000Z",
      lastError: null,
      lastRunFailed: null,
      lastRunMatched: null,
      lastRunQueued: null,
      lastRunReceived: 5,
      lastRunSubjectSkipped: null,
    });
    expect(r).toMatchObject({ label: "上轮快照", showCounts: true });
  });
});
