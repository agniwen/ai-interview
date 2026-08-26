import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { fetchResumeEvaluationHistory, fetchStudioResumes } from "./studio-resumes";

import { apiUrl } from "./rpc";
afterEach(() => vi.unstubAllGlobals());

describe("Desktop recruitment API", () => {
  it("sends advisory filters with the other filters and keeps authenticated API requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ records: [], total: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchStudioResumes("team/a", {
      jobDescriptionIds: ["job"],
      page: 2,
      pipelineStages: ["screening"],
      recommendationLevels: ["recommended", "highly_recommended"],
      skills: ["React", "TypeScript"],
    });
    const [call] = fetchMock.mock.calls;
    if (!call) {
      throw new Error("Expected a list request");
    }
    const [url, init] = call;
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/w/team%2Fa/studio/resumes");
    expect(parsed.searchParams.get("recommendationLevels")).toBe("recommended,highly_recommended");
    expect(parsed.searchParams.get("jdIds")).toBe("job");
    expect(parsed.searchParams.get("skills")).toBe("React,TypeScript");
    expect(parsed.searchParams.get("page")).toBe("2");
    expect(parsed.searchParams.has("structuredMinScore")).toBe(false);
    expect(init.credentials).toBe("include");
  });

  it("omits empty recommendation filters and exposes history request failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ records: [] }))
      .mockResolvedValueOnce(Response.json({ error: "无法读取历史" }, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchStudioResumes("team", { recommendationLevels: [] });
    expect(new URL(fetchMock.mock.calls[0]?.[0]).searchParams.has("recommendationLevels")).toBe(
      false,
    );
    await expect(fetchResumeEvaluationHistory("team", "resume/a")).rejects.toThrow("无法读取历史");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      apiUrl("/api/w/team/studio/resumes/resume%2Fa/evaluation-history"),
    );
  });
});

vi.hoisted(() => {
  vi.stubEnv("VITE_BASE_URL", "https://web.example.test");
  vi.stubEnv("VITE_BETTER_AUTH_URL", "https://api.example.test");
});
afterAll(() => vi.unstubAllEnvs());
