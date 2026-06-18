import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAIL_INGEST_PROVIDER_ID,
  MAIL_INGEST_PROVIDERS,
  applyMailIngestProvider,
  resolveMailIngestProviderId,
} from "../mail-ingest-providers";

describe("mail ingest providers", () => {
  it("defaults to Aliyun mail IMAP settings", () => {
    const provider = MAIL_INGEST_PROVIDERS.find(
      (item) => item.id === DEFAULT_MAIL_INGEST_PROVIDER_ID,
    );

    expect(provider).toMatchObject({
      id: "aliyun",
      imapHost: "imap.qiye.aliyun.com",
      imapPort: "993",
      label: "阿里云邮",
    });
  });

  it("applies provider host and port while keeping other form fields", () => {
    expect(
      applyMailIngestProvider(
        {
          emailAddress: "hr@example.com",
          imapHost: "",
          imapPort: "",
          username: "hr@example.com",
        },
        "aliyun",
      ),
    ).toEqual({
      emailAddress: "hr@example.com",
      imapHost: "imap.qiye.aliyun.com",
      imapPort: "993",
      username: "hr@example.com",
    });
  });

  it("resolves Aliyun provider from stored host and port", () => {
    expect(resolveMailIngestProviderId("imap.qiye.aliyun.com", "993")).toBe("aliyun");
    expect(resolveMailIngestProviderId("imap.qiye.aliyun.com", 993)).toBe("aliyun");
  });
});
