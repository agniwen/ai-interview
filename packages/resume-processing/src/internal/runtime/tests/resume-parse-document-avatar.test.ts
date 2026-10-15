import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { parseResumeDocument } from "../resume-parse-pipeline";
import { defaultResumeParsePipelineDependencies } from "../resume-parse-pipeline-dependencies";
import type { ResumeParsePipelineDependencies } from "../resume-parse-pipeline-dependencies";

const HTML_RESUME = {
  bytes: new TextEncoder().encode(
    "<html><body><p>张三</p><p>前端工程师 2019-2024</p></body></html>",
  ),
  fileName: "resume.html",
  mediaType: "text/html",
};

// HTML extraction is local, so only the provider switch and avatar dependency matter here.
function createDependencies(
  extractCandidateAvatar: ResumeParsePipelineDependencies["extractCandidateAvatar"],
): ResumeParsePipelineDependencies {
  return {
    ...defaultResumeParsePipelineDependencies,
    extractCandidateAvatar,
    getResumeParseProvider: () => "ocr-llm",
  };
}

describe("parseResumeDocument candidate avatar", () => {
  it("waits for avatar extraction before returning the parsed text", async () => {
    const avatar = Promise.withResolvers<string | null>();
    const extractCandidateAvatar = vi.fn(() => avatar.promise);
    let settled = false;

    const parsing = parseResumeDocument(HTML_RESUME, createDependencies(extractCandidateAvatar));
    void parsing.then(() => {
      settled = true;
    });
    await delay(10);

    expect(extractCandidateAvatar).toHaveBeenCalledWith(HTML_RESUME);
    expect(settled).toBe(false);
    avatar.resolve(null);
    await expect(parsing).resolves.toMatchObject({ textSource: "html-text" });
  });

  it("returns the parse result when no avatar is found", async () => {
    const parsed = await parseResumeDocument(
      HTML_RESUME,
      createDependencies(() => Promise.resolve(null)),
    );

    expect(parsed.text).toContain("张三");
  });
});
