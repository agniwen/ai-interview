import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "..");

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
      readSource("components/public-interview-round/public-interview-round-page.tsx"),
      readSource("components/human-interview/human-meeting-room.tsx"),
      readSource("components/interview/interview-room.tsx"),
      readSource("components/interview/interview-copy-guard.tsx"),
    ];

    expect(sources.join("\n")).not.toMatch(
      /next\/(?:dynamic|navigation|headers|server|cache|link)/u,
    );
  });
});
