import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { factory, jsonValidatorError } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";
import { isFeishuHumanInterviewEnabled } from "@app/feishu/provider";
import {
  listWorkspaceMemberDirectory,
  listWorkspaceMembers,
  setWorkspaceMemberDottedManagers,
  setWorkspaceMemberManager,
  setWorkspaceMemberPeerSharing,
} from "../../dao";
import type { SetWorkspaceMemberManagerResult } from "../../dao";

const workspaceMemberManagerInputSchema = z.object({
  managerUserId: z.string().trim().min(1).nullable(),
});

const MAX_BULK_MANAGER_MEMBERS = 500;

const workspaceMembersManagerInputSchema = z.object({
  managerUserId: z.string().trim().min(1).nullable(),
  userIds: z.array(z.string().trim().min(1)).min(1).max(MAX_BULK_MANAGER_MEMBERS),
});

const MAX_DOTTED_MANAGERS = 20;

const workspaceMemberDottedManagersInputSchema = z.object({
  managerUserIds: z.array(z.string().trim().min(1)).max(MAX_DOTTED_MANAGERS),
});

const workspaceMemberPeerSharingInputSchema = z.object({
  shareWithPeers: z.boolean(),
});

const MANAGER_UPDATE_ERRORS = {
  cycle: { message: "不能把成员本人的下级设为上级，否则汇报线会形成循环。", status: 409 },
  "manager-not-found": { message: "上级不在当前工作区中。", status: 404 },
  "member-not-found": { message: "成员不在当前工作区中。", status: 404 },
  self: { message: "不能把被设置的成员设为上级。", status: 400 },
} as const satisfies Record<
  Exclude<SetWorkspaceMemberManagerResult, "updated">,
  { message: string; status: number }
>;

export interface WorkspaceMembersRouterDependencies {
  feishuHumanInterviewEnabled: () => boolean;
  listDirectory: typeof listWorkspaceMemberDirectory;
  listOptions: typeof listWorkspaceMembers;
  requirePermission: typeof requirePermission;
  setDottedManagers: typeof setWorkspaceMemberDottedManagers;
  setManager: typeof setWorkspaceMemberManager;
  setPeerSharing: typeof setWorkspaceMemberPeerSharing;
}

const defaultDependencies: WorkspaceMembersRouterDependencies = {
  feishuHumanInterviewEnabled: isFeishuHumanInterviewEnabled,
  listDirectory: listWorkspaceMemberDirectory,
  listOptions: listWorkspaceMembers,
  requirePermission,
  setDottedManagers: setWorkspaceMemberDottedManagers,
  setManager: setWorkspaceMemberManager,
  setPeerSharing: setWorkspaceMemberPeerSharing,
};

export function createWorkspaceMembersRouter(
  dependencies: WorkspaceMembersRouterDependencies = defaultDependencies,
) {
  return factory
    .createApp()
    .get("/options", async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const records = await dependencies.listOptions(activeOrg.id);
      return c.json(
        {
          feishuHumanInterviewEnabled: dependencies.feishuHumanInterviewEnabled(),
          records,
        },
        200,
      );
    })
    .get("/", async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const records = await dependencies.listDirectory(activeOrg.id);
      return c.json({ records }, 200);
    })
    .put(
      "/manager",
      dependencies.requirePermission("member", "update"),
      zValidator(
        "json",
        workspaceMembersManagerInputSchema,
        jsonValidatorError("批量设置参数无效。"),
      ),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!(activeOrg && user)) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const { managerUserId, userIds } = c.req.valid("json");
        const result = await dependencies.setManager({
          actorUserId: user.id,
          managerUserId,
          organizationId: activeOrg.id,
          userIds,
        });
        if (result === "updated") {
          return c.json({ success: true }, 200);
        }
        const { message, status } = MANAGER_UPDATE_ERRORS[result];
        return c.json({ error: message }, status);
      },
    )
    .put(
      "/:userId/manager",
      dependencies.requirePermission("member", "update"),
      zValidator("json", workspaceMemberManagerInputSchema, jsonValidatorError("上级参数无效。")),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!(activeOrg && user)) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const result = await dependencies.setManager({
          actorUserId: user.id,
          managerUserId: c.req.valid("json").managerUserId,
          organizationId: activeOrg.id,
          userIds: [c.req.param("userId")],
        });
        if (result === "updated") {
          return c.json({ success: true }, 200);
        }
        const { message, status } = MANAGER_UPDATE_ERRORS[result];
        return c.json({ error: message }, status);
      },
    )
    .put(
      "/:userId/dotted-managers",
      dependencies.requirePermission("member", "update"),
      zValidator(
        "json",
        workspaceMemberDottedManagersInputSchema,
        jsonValidatorError("虚线汇报上级参数无效。"),
      ),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!(activeOrg && user)) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const result = await dependencies.setDottedManagers({
          actorUserId: user.id,
          managerUserIds: c.req.valid("json").managerUserIds,
          organizationId: activeOrg.id,
          userId: c.req.param("userId"),
        });
        if (result === "updated") {
          return c.json({ success: true }, 200);
        }
        const { message, status } = MANAGER_UPDATE_ERRORS[result];
        return c.json({ error: message }, status);
      },
    )
    .put(
      "/:userId/peer-sharing",
      dependencies.requirePermission("member", "update"),
      zValidator(
        "json",
        workspaceMemberPeerSharingInputSchema,
        jsonValidatorError("共享设置参数无效。"),
      ),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!(activeOrg && user)) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const result = await dependencies.setPeerSharing({
          actorUserId: user.id,
          organizationId: activeOrg.id,
          shareWithPeers: c.req.valid("json").shareWithPeers,
          userId: c.req.param("userId"),
        });
        if (result === "member-not-found") {
          return c.json({ error: MANAGER_UPDATE_ERRORS["member-not-found"].message }, 404);
        }
        return c.json({ success: true }, 200);
      },
    );
}

export const workspaceMembersRouter = createWorkspaceMembersRouter();
