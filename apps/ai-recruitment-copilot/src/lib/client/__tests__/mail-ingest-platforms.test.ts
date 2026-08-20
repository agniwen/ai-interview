import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAIL_INGEST_PLATFORM_ID,
  getMailIngestPlatform,
  resolveMailIngestPlatformId,
} from "@/lib/client/mail-ingest-platforms";

describe("mail ingest platforms", () => {
  it("maps boss直聘 to the internal subject keyword", () => {
    const platform = getMailIngestPlatform(DEFAULT_MAIL_INGEST_PLATFORM_ID);

    expect(platform.label).toBe("boss直聘");
    expect(platform.subjectKeyword).toBe("boss直聘");
  });

  it("resolves stored subject keywords back to a platform", () => {
    expect(resolveMailIngestPlatformId(" boss直聘 ")).toBe("boss_zhipin");
    expect(resolveMailIngestPlatformId("unknown")).toBe(DEFAULT_MAIL_INGEST_PLATFORM_ID);
  });
});
