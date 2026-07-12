import { describe, expect, it } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import {
  getWorkspaceRequestContext,
  WorkspaceContextInvariantError,
} from "@arc/ai-recruitment-copilot-backend/server/context/workspace-request-context";

const organization = { id: "org_1" } as never;
const member = { id: "member_1", role: "owner" } as never;
const user = { id: "user_1" } as never;

describe("getWorkspaceRequestContext", () => {
  it("returns one complete workspace-scoped context", async () => {
    const app = factory.createApp().get("/", (c) => {
      c.set("activeOrg", organization);
      c.set("member", member);
      c.set("user", user);

      const context = getWorkspaceRequestContext(c);
      return c.json({
        memberId: context.member.id,
        organizationId: context.organization.id,
        userId: context.user.id,
      });
    });

    const response = await app.request("/");

    await expect(response.json()).resolves.toEqual({
      memberId: "member_1",
      organizationId: "org_1",
      userId: "user_1",
    });
  });

  it("throws an invariant error for a partially mounted workspace route", () => {
    expect(() =>
      getWorkspaceRequestContext({
        var: {
          activeOrg: organization,
          member,
          session: null,
          user: null,
        },
      }),
    ).toThrow(WorkspaceContextInvariantError);
  });
});
