import { APIError } from "better-auth/api";
import { z } from "zod";
import { auth } from "../../../infrastructure/auth";
import { findPlatformWorkspace, isPlatformWorkspaceMember, platformUserExists } from "../dao";
import { AddUserToWorkspaceError } from "./add-user-to-workspace";
import type { AddUserToWorkspaceDependencies } from "./add-user-to-workspace";

const betterAuthErrorBodySchema = z.object({ code: z.string() });

function getBetterAuthErrorCode(error: APIError): string | undefined {
  const parsed = betterAuthErrorBodySchema.safeParse(error.body);
  return parsed.success ? parsed.data.code : undefined;
}

export const defaultAddUserToWorkspaceDependencies: AddUserToWorkspaceDependencies = {
  async addMember({ organizationId, role, userId }) {
    // 官方推荐的服务端加成员方式：不直接写 member 表，保留插件的校验与 hooks。
    // Better Auth's server-only addMember keeps the plugin's checks and hooks.
    try {
      await auth.api.addMember({ body: { organizationId, role, userId } });
    } catch (error) {
      if (error instanceof APIError) {
        const code = getBetterAuthErrorCode(error);
        if (code === "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION") {
          throw new AddUserToWorkspaceError("already_member");
        }
        if (code === "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED") {
          throw new AddUserToWorkspaceError("membership_limit_reached");
        }
      }
      throw error;
    }
  },
  findWorkspace: findPlatformWorkspace,
  isWorkspaceMember: isPlatformWorkspaceMember,
  userExists: platformUserExists,
};
