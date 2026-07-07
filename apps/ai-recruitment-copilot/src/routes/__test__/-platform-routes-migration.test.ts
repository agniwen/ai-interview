import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack Start platform route migration", () => {
  const routes = [
    "/platform",
    "/platform/mail-ingest-accounts",
    "/platform/notifications",
    "/platform/organizations",
    "/platform/queues",
    "/platform/users",
  ];

  it("registers migrated platform routes in the generated route tree", () => {
    const routeTree = readSource("routeTree.gen.ts");

    for (const route of routes) {
      expect(routeTree).toContain(`'${route}'`);
    }
  });

  it("keeps migrated platform routes and reused components free of Next runtime imports", () => {
    const sources = [
      readSource("routes/platform.tsx"),
      readSource("routes/platform.mail-ingest-accounts.tsx"),
      readSource("routes/platform.notifications.tsx"),
      readSource("routes/platform.organizations.tsx"),
      readSource("routes/platform.queues.tsx"),
      readSource("routes/platform.users.tsx"),
      readSource("components/features/platform/mail-ingest-accounts/mail-ingest-accounts-grid.tsx"),
      readSource("components/features/platform/notifications/notifications-grid.tsx"),
      readSource("components/features/platform/platform-sidebar-slots.tsx"),
      readSource("components/features/platform/platform-header.tsx"),
      readSource("components/features/platform/organizations/organizations-grid.tsx"),
      readSource("components/features/platform/queues/queues-grid.tsx"),
      readSource("components/features/platform/users/users-grid.tsx"),
      readSource("components/layout/platform-sidebar/platform-logo.tsx"),
    ];

    expect(sources.join("\n")).not.toMatch(
      /next\/(?:dynamic|navigation|headers|server|cache|link)/u,
    );
  });

  it("wires platform mail ingest accounts into the platform navigation", () => {
    const routeSource = readSource("routes/platform.mail-ingest-accounts.tsx");
    const sidebarSource = readSource("components/features/platform/platform-sidebar-slots.tsx");
    const headerSource = readSource("components/features/platform/platform-header.tsx");
    const gridSource = readSource(
      "components/features/platform/mail-ingest-accounts/mail-ingest-accounts-grid.tsx",
    );

    expect(routeSource).toContain('createFileRoute("/platform/mail-ingest-accounts")');
    expect(routeSource).toContain("loadPlatformMailIngestAccountsState");
    expect(sidebarSource).toContain("/platform/mail-ingest-accounts");
    expect(headerSource).toContain("/platform/mail-ingest-accounts");
    expect(gridSource).toContain("<DataGrid<PlatformMailIngestAccountRow>");
    expect(gridSource).toContain("<MemberCell");
    expect(gridSource).toContain("actionsColumn<PlatformMailIngestAccountRow>");
    expect(gridSource).toContain('columnPinning={{ right: ["actions"] }}');
    expect(gridSource).toContain('type: "search"');
  });

  it("splits platform mail ingest account role and status into separate columns", () => {
    const source = readSource(
      "components/features/platform/mail-ingest-accounts/mail-ingest-accounts-grid.tsx",
    );
    const roleColumnSource = source.slice(
      source.indexOf('key: "role"'),
      source.indexOf('key: "status"'),
    );
    const statusColumnSource = source.slice(
      source.indexOf('key: "status"'),
      source.indexOf('key: "imapHost"'),
    );

    expect(roleColumnSource).toContain('title: "角色"');
    expect(source).toContain("roleLabel(row.user.role)");
    expect(statusColumnSource).toContain('title: "状态"');
    expect(source).toContain('let statusLabel = "未配置";');
    expect(source).toContain('statusLabel = "启用";');
    expect(source).toContain('statusLabel = "停用";');
    expect(statusColumnSource).not.toContain("roleLabel");
  });

  it("wraps every platform leaf page in a page-level container", () => {
    const leafRouteFiles = [
      "routes/platform.mail-ingest-accounts.tsx",
      "routes/platform.notifications.tsx",
      "routes/platform.organizations.tsx",
      "routes/platform.queues.tsx",
      "routes/platform.users.tsx",
    ];
    const layoutSource = readSource("routes/platform.tsx");

    expect(layoutSource).not.toContain("container mx-auto");
    for (const file of leafRouteFiles) {
      expect(readSource(file)).toContain("container mx-auto");
    }
  });
});
