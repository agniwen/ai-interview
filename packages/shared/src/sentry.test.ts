import { describe, expect, it } from "vitest";
import { createSentryOptions, resolveSentryDsn } from "./sentry";

describe("resolveSentryDsn", () => {
  it("prefers the runtime project and falls back to a shared project", () => {
    expect(
      resolveSentryDsn(
        {
          SENTRY_DSN: "https://shared.example/1",
          SENTRY_WORKER_DSN: "https://worker.example/2",
        },
        "SENTRY_WORKER_DSN",
      ),
    ).toBe("https://worker.example/2");
    expect(resolveSentryDsn({ SENTRY_DSN: " https://shared.example/1 " }, "SENTRY_WEB_DSN")).toBe(
      "https://shared.example/1",
    );
  });
});

describe("createSentryOptions", () => {
  it("stays disabled when the shared DSN is blank", () => {
    expect(
      createSentryOptions({
        dsn: "  ",
        environment: "production",
        release: "abc123",
        runtime: "worker",
      }),
    ).toBeNull();
  });

  it("builds privacy-first error-monitoring options", () => {
    const options = createSentryOptions({
      dsn: " https://public@example.ingest.sentry.io/1 ",
      environment: " production ",
      release: " abc123 ",
      runtime: "web-client",
    });

    expect(options).toMatchObject({
      dataCollection: { httpBodies: [], userInfo: false },
      dsn: "https://public@example.ingest.sentry.io/1",
      environment: "production",
      initialScope: { tags: { "arc.runtime": "web-client" } },
      release: "abc123",
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  });

  it("removes recruiting data and credentials before sending an event", () => {
    const options = createSentryOptions({
      dsn: "https://public@example.ingest.sentry.io/1",
      environment: "production",
      runtime: "backend",
    });
    const event = {
      breadcrumbs: [
        {
          category: "http",
          data: {
            method: "POST",
            prompt: "请分析这份简历",
          },
        },
      ],
      extra: {
        candidateName: "张三",
        email: "candidate@example.com",
        retryCount: 1,
      },
      request: {
        cookies: { session: "secret" },
        data: { resume: "private resume" },
        headers: {
          Authorization: "Bearer secret",
          Cookie: "session=secret",
          "x-request-id": "request-1",
        },
      },
      user: {
        email: "candidate@example.com",
        id: "internal-user-id",
        ip_address: "127.0.0.1",
      },
    };

    const sanitized = options?.beforeSend(event);

    expect(sanitized).toEqual({
      breadcrumbs: [
        {
          category: "http",
          data: {
            method: "POST",
            prompt: "[Filtered]",
          },
        },
      ],
      extra: {
        candidateName: "[Filtered]",
        email: "[Filtered]",
        retryCount: 1,
      },
      request: {
        headers: {
          "x-request-id": "request-1",
        },
      },
      user: { id: "internal-user-id" },
    });
  });

  it("drops console breadcrumbs instead of forwarding arbitrary log payloads", () => {
    const options = createSentryOptions({
      dsn: "https://public@example.ingest.sentry.io/1",
      runtime: "desktop-renderer",
    });

    expect(
      options?.beforeBreadcrumb({ category: "console", message: "private resume" }),
    ).toBeNull();
  });
});
