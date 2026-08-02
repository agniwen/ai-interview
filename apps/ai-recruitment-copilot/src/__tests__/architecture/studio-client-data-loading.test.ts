import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(import.meta.dirname, "../../..");

const listRoutes = [
  "departments",
  "forms",
  "interview-questions",
  "interviewers",
  "interviews",
  "job-descriptions",
  "resumes",
] as const;

const extractedPageRoutes = listRoutes.filter((route) => route !== "resumes");

function readSource(relativePath: string): string {
  return readFileSync(path.join(appRoot, relativePath), "utf-8");
}

describe("Studio client data loading", () => {
  it.each(listRoutes)("does not hydrate the %s route from a route loader", (route) => {
    const source = readSource(`src/routes/w.$slug.studio.${route}.tsx`);

    expect(source).not.toContain("HydrationBoundary");
    expect(source).not.toContain("DehydratedState");
  });

  it("does not retain manual QueryClient hydration modules for Studio list routes", () => {
    for (const route of listRoutes) {
      const serverModule = path.join(appRoot, `src/lib/start/studio/${route}.server.ts`);
      if (!existsSync(serverModule)) {
        continue;
      }

      const source = readFileSync(serverModule, "utf-8");
      expect(source).not.toContain("createQueryClient");
      expect(source).not.toContain("dehydrate(");
      expect(source).not.toContain("prefetchQuery");
      expect(source).not.toContain("prefetchInfiniteQuery");
    }
  });

  it.each(extractedPageRoutes)("keeps the %s route as a thin routing boundary", (route) => {
    const source = readSource(`src/routes/w.$slug.studio.${route}.tsx`);

    expect(source).not.toContain("useDataGridState");
    expect(source).not.toContain("rpcFetch");
    expect(source.split("\n").length).toBeLessThan(120);
  });
});
