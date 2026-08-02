import { describe, expect, it } from "vitest";
import { Route } from "./w.$slug.studio.resumes";

function shouldReloadAt(pathname: string) {
  const { shouldReload } = Route.options;

  return typeof shouldReload === "function"
    ? shouldReload({
        location: { pathname },
        params: { slug: "acme" },
      } as never)
    : shouldReload;
}

describe("Studio resumes route reload behavior", () => {
  it("does not repeat the access loader for list search or pagination changes", () => {
    expect(shouldReloadAt("/w/acme/studio/resumes")).toBe(false);
  });

  it("does not repeat the access loader while a candidate detail route is active", () => {
    expect(shouldReloadAt("/w/acme/studio/resumes/candidate-1")).toBe(false);
  });
});
