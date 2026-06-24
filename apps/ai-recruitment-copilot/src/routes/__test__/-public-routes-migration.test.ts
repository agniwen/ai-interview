import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack Start public route migration", () => {
  const routes = [
    "/invite/$token",
    "/r/$roundId",
    "/human-interview/$inviteToken",
    "/human-interview/interviewer/$inviteToken",
    "/interview/$id",
    "/interview/$id/$roundId",
    "/referrals/$token",
  ];

  it("registers migrated public routes in the generated route tree", () => {
    const routeTree = readSource("routeTree.gen.ts");

    for (const route of routes) {
      expect(routeTree).toContain(`'${route}'`);
    }
  });

  it("keeps migrated public routes and reused page components free of Next runtime imports", () => {
    const sources = [
      readSource("routes/invite.$token.tsx"),
      readSource("routes/r.$roundId.tsx"),
      readSource("routes/human-interview.$inviteToken.tsx"),
      readSource("routes/human-interview.interviewer.$inviteToken.tsx"),
      readSource("routes/interview.tsx"),
      readSource("routes/interview.$id.tsx"),
      readSource("routes/interview.$id.$roundId.tsx"),
      readSource("routes/referrals.$token.tsx"),
      readSource("components/features/human-interview/human-meeting-room.tsx"),
      readSource("components/features/interview/interview-room.tsx"),
      readSource("components/features/interview/interview-copy-guard.tsx"),
    ];

    expect(sources.join("\n")).not.toMatch(
      /next\/(?:dynamic|navigation|headers|server|cache|link)/u,
    );
  });

  it("only redirects the legacy interview id route before entering a round route", () => {
    const source = readSource("routes/interview.$id.tsx");

    expect(source).toContain("loader: async ({ location, params })");
    expect(source).toMatch(/location\.pathname === `\/interview\/\$\{params\.id\}`/u);
  });

  it("keeps referral upload single-shot with a success-only follow-up state", () => {
    const source = readSource("routes/referrals.$token.tsx");

    expect(source).toContain("maxFiles={1}");
    expect(source).toContain("multiple={false}");
    expect(source).toContain("{submittedFileName} 已提交成功。");
    expect(source).not.toContain("继续上传");
  });

  it("renders the nested interview round route after resolving a round id", () => {
    const source = readSource("routes/interview.$id.tsx");

    expect(source).toContain("Outlet");
    expect(source).toContain("<Outlet />");
  });
});
