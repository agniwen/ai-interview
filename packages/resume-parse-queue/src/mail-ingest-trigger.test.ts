import { describe, expect, it } from "vitest";
import { MAIL_INGEST_TRIGGER_JOB_NAME, mailIngestTriggerJobSchema } from "./mail-ingest-trigger";

describe("mail ingest trigger queue", () => {
  it("validates one workspace-scoped immediate poll request", () => {
    expect(MAIL_INGEST_TRIGGER_JOB_NAME).toBe("poll-mail-ingest-now");
    expect(
      mailIngestTriggerJobSchema.parse({
        organizationId: "org_1",
      }),
    ).toEqual({
      organizationId: "org_1",
    });
  });
});
