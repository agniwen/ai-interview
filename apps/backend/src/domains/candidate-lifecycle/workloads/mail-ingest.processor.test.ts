/* oxlint-disable unicorn/no-useless-undefined -- Async fakes implement the IMAP workload ports. */
import { describe, expect, it, vi } from "vitest";
import { processMailIngestWorkload } from "./mail-ingest.processor.js";
import type { MailIngestProcessorPorts } from "./mail-ingest.processor.js";

describe("processMailIngestWorkload", () => {
  it("honors organization-scoped account discovery before opening IMAP", async () => {
    const listEnabledAccounts = vi.fn(async () => []);
    const ports: MailIngestProcessorPorts = {
      buildAttachmentKeyByHash: vi.fn(async () => "attachment-key"),
      claimAccount: vi.fn(async () => null),
      claimMessage: vi.fn(async () => ({ id: "message-1", shouldProcess: false })),
      enqueueResumeParseJobs: vi.fn(async () => undefined),
      fetchPublishedJobsByCodes: vi.fn(async () => []),
      finishAccount: vi.fn(async () => undefined),
      insertBatch: vi.fn(async () => "batch-1"),
      listEnabledAccounts,
      loadBatchDetail: vi.fn(async () => null),
      markMessageSkipped: vi.fn(async () => undefined),
      putObjectBytes: vi.fn(async () => undefined),
      updateMessageResult: vi.fn(async () => undefined),
    };
    const scope = { organizationId: "organization-1" };

    const result = await processMailIngestWorkload(
      { intervalMs: 60_000, maxAccountsPerRun: 10, maxMessagesPerAccount: 20 },
      ports,
      scope,
    );

    expect(listEnabledAccounts).toHaveBeenCalledWith(10, scope);
    expect(result).toEqual({
      accounts: 0,
      messagesFailed: 0,
      messagesQueued: 0,
      messagesSkipped: 0,
    });
  });
});
