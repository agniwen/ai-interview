import { listTextFiltersSchema } from "@arc/shared/list-text-filters";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { factory, jsonValidatorError } from "../../../../../../factory";
import { isFeishuHumanInterviewEnabled } from "../../../../../../integrations/feishu/provider";
import { listWorkspaceMembers, queryPaginatedWorkspaceMembers } from "../../dao";
import type { WorkspaceMemberListQuery } from "../../dao";

const workspaceMemberListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["createdAt", "lastActiveAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  textFilters: listTextFiltersSchema("members"),
});

export interface WorkspaceMembersRouterDependencies {
  feishuHumanInterviewEnabled: () => boolean;
  listOptions: typeof listWorkspaceMembers;
  queryMembers: (
    organizationId: string,
    query: WorkspaceMemberListQuery,
  ) => ReturnType<typeof queryPaginatedWorkspaceMembers>;
}

const defaultDependencies: WorkspaceMembersRouterDependencies = {
  feishuHumanInterviewEnabled: isFeishuHumanInterviewEnabled,
  listOptions: listWorkspaceMembers,
  queryMembers: queryPaginatedWorkspaceMembers,
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
    .get(
      "/",
      zValidator("query", workspaceMemberListQuerySchema, jsonValidatorError("查询参数无效。")),
      async (c) => {
        const { activeOrg } = c.var;
        if (!activeOrg) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const result = await dependencies.queryMembers(activeOrg.id, c.req.valid("query"));
        return c.json(result, 200);
      },
    );
}

export const workspaceMembersRouter = createWorkspaceMembersRouter();
