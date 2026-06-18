import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack Start studio settings and detail route migration", () => {
  const routes = [
    "/w/$slug/studio/interview-questions",
    "/w/$slug/studio/global-config",
    "/w/$slug/studio/members",
    "/w/$slug/studio/me",
    "/w/$slug/studio/mail-ingest-accounts",
    "/w/$slug/studio/interviews/$roundId",
  ];

  it("registers migrated studio settings and detail routes in the generated route tree", () => {
    const routeTree = readSource("routeTree.gen.ts");

    for (const route of routes) {
      expect(routeTree).toContain(`'${route}'`);
    }
  });

  it("keeps migrated route files and reused components free of Next runtime imports", () => {
    const sources = [
      readSource("routes/w.$slug.studio.interview-questions.tsx"),
      readSource("routes/w.$slug.studio.global-config.tsx"),
      readSource("routes/w.$slug.studio.members.tsx"),
      readSource("routes/w.$slug.studio.me.tsx"),
      readSource("routes/w.$slug.studio.mail-ingest-accounts.tsx"),
      readSource("routes/w.$slug.studio.interviews.$roundId.tsx"),
      readSource("components/features/studio/global-config/global-config-form.tsx"),
    ];

    expect(sources.join("\n")).not.toMatch(
      /next\/(?:dynamic|navigation|headers|server|cache|link)/u,
    );
  });

  it("keeps the mail ingest account table aligned with shared table conventions", () => {
    const source = readSource("routes/w.$slug.studio.mail-ingest-accounts.tsx");
    const memberCellSource = readSource("components/data-grid/cells/member-cell.tsx");

    expect(source).toContain(
      'import { MemberCell } from "@/components/data-grid/cells/member-cell"',
    );
    expect(source).toContain("<MemberCell");
    expect(source).toContain("useDataGridState<ManagedMailIngestRow");
    expect(source).toContain("<DataGrid<ManagedMailIngestRow>");
    expect(source).toContain('type: "search"');
    expect(source).toContain('columnPinning={{ right: ["actions"] }}');
    expect(source).not.toContain("<Table>");
    expect(source).not.toContain("function getInitials");
    expect(source).not.toContain("PencilIcon");
    expect(source).not.toContain("PlusIcon");
    expect(memberCellSource).toContain('avatarSize = "sm"');
  });
});
