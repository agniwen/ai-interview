import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { resumePoolListQuerySchema } from "../../resume-pool/schema";
import { resumeLibraryListQuerySchema } from "../list-schema";

const app = new Hono().get("/resumes", zValidator("query", resumeLibraryListQuerySchema), (c) =>
  c.json(c.req.valid("query"), 200),
);

describe("resume creation date query validation", () => {
  it("accepts dates together with stage, creator, and subsequent-page parameters", async () => {
    const response = await app.request(
      "/resumes?createdFrom=2026-08-01&createdTo=2026-08-26&pipelineStages=ai_interview&creatorIds=user-1&page=2&knownTotal=120",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      createdFrom: "2026-08-01",
      createdTo: "2026-08-26",
      creatorIds: "user-1",
      knownTotal: 120,
      page: "2",
      pipelineStages: "ai_interview",
    });
  });

  it.each([
    "createdFrom=2026-08-27&createdTo=2026-08-26",
    "createdFrom=2026-02-30",
    "createdTo=2026-08-26T23:59:59",
  ])("rejects malformed ranges before reaching the query: %s", async (query) => {
    const response = await app.request(`/resumes?${query}`);
    expect(response.status).toBe(400);
  });

  it("keeps talent pool and recruitment desk validation aligned", () => {
    for (const schema of [resumePoolListQuerySchema, resumeLibraryListQuerySchema]) {
      expect(schema.safeParse({ createdFrom: "2026-08-26", createdTo: "2026-08-25" }).success).toBe(
        false,
      );
      expect(schema.parse({ createdFrom: "2026-08-26", createdTo: "2026-08-26" })).toMatchObject({
        createdFrom: "2026-08-26",
        createdTo: "2026-08-26",
      });
    }
  });
});
