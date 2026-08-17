import { describe, expect, it } from "vitest";
import { Route } from "./w.$slug.studio.resumes";

function isReloadCallback(
  value: typeof Route.options.shouldReload,
): value is Extract<typeof Route.options.shouldReload, (...args: never[]) => boolean> {
  return typeof value === "function";
}

function shouldReloadAt(pathname: string) {
  const { shouldReload } = Route.options;

  if (isReloadCallback(shouldReload)) {
    // SAFETY: The test provides the route location and slug fields required by the route callback.
    return shouldReload({
      location: { pathname },
      params: { slug: "acme" },
    } as never);
  }
  return shouldReload;
}

describe("Studio resumes route reload behavior", () => {
  it("does not repeat the access loader for list search or pagination changes", () => {
    expect(shouldReloadAt("/w/acme/studio/resumes")).toBe(false);
  });

  it("does not repeat the access loader while a candidate detail route is active", () => {
    expect(shouldReloadAt("/w/acme/studio/resumes/candidate-1")).toBe(false);
  });
});
