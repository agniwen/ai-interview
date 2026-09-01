import { describe, expect, it } from "vitest";
import {
  countExpectedHttpContractOperations,
  findHttpContractParityIssues,
} from "../../migration/http-contract-parity.js";

describe("HTTP contract parity reporter", () => {
  it("normalizes OpenAPI parameters and excludes the opaque Better Auth handler", () => {
    expect(
      findHttpContractParityIssues(
        [
          { id: "GET /api/things/:id" },
          { id: "POST /api/auth/*", special: "better-auth-handler" },
          { id: "DELETE /api/missing/:id" },
        ],
        {
          components: {},
          info: { title: "test", version: "1" },
          openapi: "3.0.0",
          paths: {
            "/api/extra": { post: { responses: {} } },
            "/api/things/{id}": { get: { responses: {} } },
          },
        },
      ),
    ).toEqual({
      extra: ["POST /api/extra"],
      missing: ["DELETE /api/missing/:id"],
    });
  });

  it("counts the legacy preview and download suffix dispatch as one route shape", () => {
    const entries = [
      { id: "GET /api/w/:slug/chat/attachments/:previewId" },
      { id: "GET /api/w/:slug/chat/attachments/:id" },
    ];

    expect(countExpectedHttpContractOperations(entries)).toBe(1);
    expect(
      findHttpContractParityIssues(entries, {
        components: {},
        info: { title: "test", version: "1" },
        openapi: "3.0.0",
        paths: {
          "/api/w/{slug}/chat/attachments/{id}": { get: { responses: {} } },
        },
      }),
    ).toEqual({ extra: [], missing: [] });
  });
});
