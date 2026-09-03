import { describe, expect, it } from "vitest";
import { NO_ACCESS_WORKSPACE_ROLE } from "@app/shared/permissions";
import { resolveHomeRedirect } from "./home-navigation";

describe("resolveHomeRedirect", () => {
  it("keeps unauthenticated visitors on the static homepage", () => {
    expect(resolveHomeRedirect({ status: "unauthenticated" })).toBeNull();
  });

  it("sends users without an active workspace to workspace selection", () => {
    expect(resolveHomeRedirect({ status: "no_active_workspace" })).toBe("/select-workspace");
  });

  it("sends members without access to the waiting page", () => {
    expect(
      resolveHomeRedirect({
        member: { role: NO_ACCESS_WORKSPACE_ROLE },
        status: "ready",
        workspace: { id: "workspace-1", slug: "acme" },
      }),
    ).toBe("/wait");
  });

  it("preserves the homepage CTA destination for authenticated users", () => {
    const state = {
      member: { role: "owner" },
      status: "ready" as const,
      workspace: { id: "workspace-1", slug: "acme" },
    };

    expect(resolveHomeRedirect(state, "agent")).toBe("/w/acme/agent");
    expect(resolveHomeRedirect(state, "studio")).toBe("/w/acme/studio/resumes");
  });
});
