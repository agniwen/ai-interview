import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MASTRA_STUDIO_ROUTE_BASE,
  addMastraStudioBase,
  buildSearchHref,
  removeMastraStudioBase,
} from "./compat";

const appRoot = path.resolve(import.meta.dirname, "../../../../..");

function readAppSource(relativePath: string) {
  return readFileSync(path.join(appRoot, relativePath), "utf-8");
}

function generatedStudioPaths() {
  const routeTree = readAppSource("src/routeTree.gen.ts");
  return new Set(
    [...routeTree.matchAll(/fullPath: '(\/platform\/mastra-studio[^']*)'/g)].map(([, routePath]) =>
      routePath.replace(/\/$/, ""),
    ),
  );
}

describe("Mastra Studio TanStack Router integration", () => {
  it("keeps the Studio subtree client-only", () => {
    const parentRoute = readAppSource("src/routes/platform.mastra-studio.tsx");

    expect(parentRoute).toContain('createFileRoute("/platform/mastra-studio")');
    expect(parentRoute).toContain("pendingComponent: MastraStudioRouteSkeleton");
    expect(parentRoute).toContain("ssr: false");
  });

  it("scopes Studio theme classes and portals to the embedded root", () => {
    const routeRoot = readAppSource(
      "src/components/features/mastra-studio/router/studio-route-root.tsx",
    );
    const scopedTheme = readAppSource(
      "src/components/features/mastra-studio/router/scoped-mastra-theme.tsx",
    );

    expect(routeRoot).toContain("<ScopedMastraTheme>");
    expect(scopedTheme).toContain('className="mastra-studio-theme');
    expect(scopedTheme).toContain('storageKey="theme"');
    expect(scopedTheme).toContain("target={target}");
    expect(scopedTheme).toContain("<PortalContainerProvider container={target}>");
    expect(scopedTheme).toContain("useHostTheme");
  });

  it("generates every major upstream route branch below the platform base", () => {
    const paths = generatedStudioPaths();
    const expectedPaths = [
      "/platform/mastra-studio",
      "/platform/mastra-studio/agents",
      "/platform/mastra-studio/agents/$agentId/chat/$threadId",
      "/platform/mastra-studio/agents/$agentId/settings",
      "/platform/mastra-studio/agents/$agentId/tools/$toolId",
      "/platform/mastra-studio/agent-builder/agents/$id/edit",
      "/platform/mastra-studio/agent-builder/skills/$id/view",
      "/platform/mastra-studio/cms/agents/$agentId/edit/instruction-blocks",
      "/platform/mastra-studio/cms/prompts/$promptBlockId/edit",
      "/platform/mastra-studio/datasets/$datasetId/items/$itemId/versions",
      "/platform/mastra-studio/datasets/$datasetId/experiments/$experimentId",
      "/platform/mastra-studio/mcps/$serverId/tools/$toolId",
      "/platform/mastra-studio/scorers/$scorerId",
      "/platform/mastra-studio/traces/$traceId",
      "/platform/mastra-studio/workflows/$workflowId/graph/$runId",
      "/platform/mastra-studio/workflows/schedules/$scheduleId",
      "/platform/mastra-studio/workspaces/$workspaceId/skills/$skillName",
    ];

    expect(paths.size).toBeGreaterThanOrEqual(90);
    for (const routePath of expectedPaths) {
      expect(paths, `missing generated route: ${routePath}`).toContain(routePath);
    }
  });

  it("adds and removes the embedded base without changing relative or external links", () => {
    expect(addMastraStudioBase("/agents/a/chat/new")).toBe(
      `${MASTRA_STUDIO_ROUTE_BASE}/agents/a/chat/new`,
    );
    expect(addMastraStudioBase(`${MASTRA_STUDIO_ROUTE_BASE}/agents`)).toBe(
      `${MASTRA_STUDIO_ROUTE_BASE}/agents`,
    );
    expect(addMastraStudioBase("../agents")).toBe("../agents");
    expect(addMastraStudioBase("https://mastra.ai/docs")).toBe("https://mastra.ai/docs");
    expect(removeMastraStudioBase(`${MASTRA_STUDIO_ROUTE_BASE}/workflows`)).toBe("/workflows");
  });

  it("preserves native query-string values and repeated keys", () => {
    const params = new URLSearchParams();
    params.append("tag", "first");
    params.append("tag", "second");
    params.set("query", "latency p95 + errors");

    const href = buildSearchHref(`${MASTRA_STUDIO_ROUTE_BASE}/metrics`, params, "#chart");
    const parsed = new URL(href, "https://example.test");

    expect(href).toBe(
      `${MASTRA_STUDIO_ROUTE_BASE}/metrics?tag=first&tag=second&query=latency+p95+%2B+errors#chart`,
    );
    expect(parsed.searchParams.getAll("tag")).toEqual(["first", "second"]);
    expect(parsed.searchParams.get("query")).toBe("latency p95 + errors");
  });
});
