import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStudioResumes } from "../endpoints/studio-resumes";

afterEach(() => vi.unstubAllGlobals());

describe("recruitment creation date API parameters", () => {
  it("sends date-only bounds on every page alongside other filters", async () => {
    const urls: URL[] = [];
    vi.stubGlobal("fetch", (input: string | URL | Request) => {
      urls.push(
        new URL(input instanceof Request ? input.url : String(input), "https://example.test"),
      );
      return Promise.resolve(
        Response.json({ page: 1, pageSize: 100, records: [], total: 120, totalPages: 2 }),
      );
    });
    for (const page of [1, 2]) {
      await fetchStudioResumes("demo", {
        createdFrom: "2026-08-25",
        createdTo: "2026-08-26",
        knownTotal: page === 2 ? 120 : undefined,
        page,
        pipelineStages: ["ai_interview"],
        skills: ["Docker"],
      });
    }
    expect(urls).toHaveLength(2);
    for (const url of urls) {
      expect(url.searchParams.get("createdFrom")).toBe("2026-08-25");
      expect(url.searchParams.get("createdTo")).toBe("2026-08-26");
      expect(url.searchParams.get("pipelineStages")).toBe("ai_interview");
      expect(url.searchParams.get("skills")).toBe("Docker");
    }
    expect(urls[0]?.searchParams.has("knownTotal")).toBe(false);
    expect(urls[1]?.searchParams.get("knownTotal")).toBe("120");
    await fetchStudioResumes("demo");
    expect(urls[2]?.searchParams.has("createdFrom")).toBe(false);
    expect(urls[2]?.searchParams.has("createdTo")).toBe(false);
  });
});
