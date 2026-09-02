import type { SessionStateDependencies } from "./application/session-state";
import {
  resolveActiveOrganizationState,
  resolveNoAccessWaitState,
  resolveWorkspaceAccessState,
  resolveWorkspaceSelectionState,
} from "./application/session-state";
import { factory } from "../../factory";

export function createSessionRouter(dependencies: SessionStateDependencies) {
  return factory
    .createApp()
    .get("/active-workspace", async (c) => {
      const state = await resolveActiveOrganizationState(
        c.var.user,
        c.req.raw.headers,
        dependencies,
      );
      return c.json(state, 200);
    })
    .get("/workspaces", async (c) => {
      const state = await resolveWorkspaceSelectionState(
        c.var.user,
        c.req.raw.headers,
        dependencies,
      );
      return c.json(state, 200);
    })
    .get("/no-access-wait", async (c) => {
      const state = await resolveNoAccessWaitState(c.var.user, dependencies);
      return c.json(state, 200);
    })
    .get("/workspaces/:slug/access", async (c) => {
      const state = await resolveWorkspaceAccessState(
        c.var.user,
        c.req.raw.headers,
        c.req.param("slug"),
        dependencies,
      );
      return c.json(state, 200);
    })
    .get("/platform-admin", (c) => {
      if (!c.var.user) {
        return c.json({ status: "unauthenticated" as const }, 200);
      }
      if (c.var.user.role !== "admin") {
        return c.json({ status: "forbidden" as const }, 200);
      }
      return c.json({ status: "ready" as const }, 200);
    });
}
