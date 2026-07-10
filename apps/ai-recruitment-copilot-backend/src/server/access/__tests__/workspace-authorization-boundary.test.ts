import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../../../..");
const backendRoot = path.join(repoRoot, "apps/ai-recruitment-copilot-backend/src");
const webRoot = path.join(repoRoot, "apps/ai-recruitment-copilot/src");

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = path.join(directory, entry);
    if (statSync(absolutePath).isDirectory()) {
      return entry === "__tests__" ? [] : listSourceFiles(absolutePath);
    }
    return /\.(ts|tsx)$/u.test(entry) && !/\.test\.(ts|tsx)$/u.test(entry) ? [absolutePath] : [];
  });
}

function filesContaining(root: string, pattern: RegExp): string[] {
  return listSourceFiles(root)
    .filter((file) => pattern.test(readFileSync(file, "utf-8")))
    .map((file) => path.relative(repoRoot, file));
}

describe("request-scoped workspace authorization boundary", () => {
  it("does not use mutable active-organization session state in application code", () => {
    const implicitContextPattern =
      /activeOrganizationId|setActiveOrganization|organization\.setActive/u;

    expect([
      ...filesContaining(backendRoot, implicitContextPattern),
      ...filesContaining(webRoot, implicitContextPattern),
    ]).toEqual([]);
  });

  it("centralizes Better Auth permission checks that require an explicit organization", () => {
    expect(filesContaining(backendRoot, /auth\.api\.hasPermission/u)).toEqual([
      "apps/ai-recruitment-copilot-backend/src/server/access/workspace-permissions.ts",
    ]);

    const helper = readFileSync(
      path.join(backendRoot, "server/access/workspace-permissions.ts"),
      "utf-8",
    );
    expect(helper).toContain("organizationId");
    expect(helper).toContain("auth.api.hasPermission");
  });

  it("keeps recruiting group resource and role policy in one module", () => {
    const policyPattern = /RECRUITING_GROUP_RESOURCES|groupRoleAllows/u;

    expect(filesContaining(backendRoot, policyPattern)).toEqual([
      "apps/ai-recruitment-copilot-backend/src/server/access/workspace-access-policy.ts",
    ]);
    expect(filesContaining(webRoot, policyPattern)).toEqual([]);
  });

  it("mounts every workspace business router behind one URL-scoped boundary", () => {
    const workspaceRouter = readFileSync(
      path.join(backendRoot, "server/routes/workspace/route.ts"),
      "utf-8",
    );
    const app = readFileSync(path.join(backendRoot, "server/app.ts"), "utf-8");

    expect(workspaceRouter).toContain('.use("*", authMiddleware, workspaceMiddleware)');
    expect(workspaceRouter).toContain('.route("/studio", studioRouter)');
    expect(workspaceRouter).toContain('.route("/chat", chatRouter)');
    expect(workspaceRouter).toContain('.route("/interview", interviewAnalysisRouter)');
    expect(workspaceRouter).toContain('.route("/resume/chat", resumeChatRouter)');
    expect(app).toContain('.route("/w/:slug", workspaceRouter)');
  });
});
