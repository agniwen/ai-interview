import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type {
  CandidateDocumentAdminCommands,
  CandidateNotificationAdminCommands,
  MailIngestAdminCommands,
  MailIngestAdminError,
} from "../../candidate-lifecycle/public.js";
import type { PlatformOperationalReadModel } from "../infrastructure/platform-operational-read-model.port.js";
import { PlatformOperationsService } from "./platform-operations.service.js";

async function notImplemented(): Promise<never> {
  throw new Error("Unexpected candidate administration command");
}

function serviceWith(overrides: {
  documents?: Partial<CandidateDocumentAdminCommands>;
  mail?: Partial<MailIngestAdminCommands>;
  notifications?: Partial<CandidateNotificationAdminCommands>;
  readModel?: Partial<PlatformOperationalReadModel>;
}) {
  const mail: MailIngestAdminCommands = {
    create: notImplemented,
    update: notImplemented,
    ...overrides.mail,
  };
  const documents: CandidateDocumentAdminCommands = {
    resetResumeParseCache: notImplemented,
    ...overrides.documents,
  };
  const notifications: CandidateNotificationAdminCommands = {
    resend: notImplemented,
    ...overrides.notifications,
  };
  const readModel: PlatformOperationalReadModel = {
    getLatestProviderAccountOpenId: notImplemented,
    getNotificationDocumentAccess: notImplemented,
    getNotificationDocumentStructure: notImplemented,
    getNotificationPreview: notImplemented,
    getResumeParseCache: notImplemented,
    getResumeQueueJobDetails: notImplemented,
    listMailAccounts: notImplemented,
    listNotifications: notImplemented,
    listResumeParseCache: notImplemented,
    ...overrides.readModel,
  };
  return new PlatformOperationsService(readModel, mail, documents, notifications);
}

const mailInput = {
  emailAddress: "recruiting@example.com",
  enabled: true,
  failedMailbox: "ARC-Failed",
  imapHost: "imap.example.com",
  imapPort: 993,
  imapSecure: true,
  mailbox: "INBOX",
  organizationId: "organization-1",
  password: "secret",
  processedMailbox: "ARC-Processed",
  subjectKeyword: "resume",
  userId: "user-1",
  username: "recruiting@example.com",
};

describe("PlatformOperationsService candidate administration adapter", () => {
  it("delegates operational database reads through the read-model port", async () => {
    const query = {
      page: 1,
      pageSize: 20,
      search: undefined,
      sortBy: "userName" as const,
      sortOrder: "asc" as const,
      textFilters: undefined,
    };
    const response = { page: 1, pageSize: 20, records: [], total: 0, totalPages: 1 };
    const listMailAccounts = vi.fn(async () => response);
    const service = serviceWith({ readModel: { listMailAccounts } });

    await expect(service.listMailAccounts(query)).resolves.toEqual(response);
    expect(listMailAccounts).toHaveBeenCalledWith(query);
  });

  it.each<{
    error: MailIngestAdminError;
    exception: typeof BadRequestException | typeof NotFoundException;
    message: string;
  }>([
    {
      error: { code: "MAIL_INGEST_MEMBER_NOT_FOUND" },
      exception: NotFoundException,
      message: "Workspace member not found",
    },
    {
      error: { code: "MAIL_INGEST_ACCOUNT_NOT_FOUND" },
      exception: NotFoundException,
      message: "Mail ingest account not found",
    },
    {
      error: { code: "MAIL_INGEST_SECRET_MISSING" },
      exception: BadRequestException,
      message: "Mail ingest encryption is not configured",
    },
    {
      error: { code: "MAIL_INGEST_LOGIN_FAILED", message: "IMAP rejected credentials" },
      exception: BadRequestException,
      message: "IMAP rejected credentials",
    },
  ])("translates $error.code into the established mail error envelope", async (testCase) => {
    const service = serviceWith({
      mail: {
        create: vi.fn(async () => ({ error: testCase.error, ok: false as const })),
      },
    });

    const operation = service.createMailAccount(mailInput);
    await expect(operation).rejects.toBeInstanceOf(testCase.exception);
    await expect(operation).rejects.toMatchObject({
      errorCode: testCase.error.code,
      response: { message: testCase.message },
    });
  });

  it("preserves the resume-cache not-found error and successful response", async () => {
    const missing = serviceWith({
      documents: {
        resetResumeParseCache: vi.fn(async () => ({
          error: { code: "RESUME_PARSE_CACHE_NOT_FOUND" as const },
          ok: false as const,
        })),
      },
    });
    await expect(missing.deleteResumeParseCache("missing-hash")).rejects.toMatchObject({
      errorCode: "RESUME_PARSE_CACHE_NOT_FOUND",
      response: { message: "Resume parse cache entry not found" },
    });

    const found = serviceWith({
      documents: {
        resetResumeParseCache: vi.fn(async () => ({
          ok: true as const,
          value: { clearedCount: 3 },
        })),
      },
    });
    await expect(found.deleteResumeParseCache("known-hash")).resolves.toEqual({
      clearedCount: 3,
    });
  });

  it("preserves the notification resend not-found error and successful response", async () => {
    const missing = serviceWith({
      notifications: {
        resend: vi.fn(async () => ({
          error: { code: "PLATFORM_NOTIFICATION_NOT_FOUND" as const },
          ok: false as const,
        })),
      },
    });
    await expect(missing.resendNotification("missing-notification")).rejects.toMatchObject({
      errorCode: "PLATFORM_NOTIFICATION_NOT_FOUND",
      response: { message: "Notification not found" },
    });

    const resent = serviceWith({
      notifications: {
        resend: vi.fn(async () => ({
          ok: true as const,
          value: { id: "notification-1", status: "pending" as const },
        })),
      },
    });
    await expect(resent.resendNotification("notification-1")).resolves.toEqual({
      id: "notification-1",
      status: "pending",
    });
  });
});
