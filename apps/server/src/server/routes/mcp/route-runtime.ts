import { auth, trustedOrigins } from "../../../lib/server/auth";
import { getRequiredEnv } from "../../../lib/server/env";
import { createRequestWorkspaceAuthorizer } from "../../access/workspace-access-policy";
import { resolveRecruitingVisibilityScope } from "../../access/recruiting-visibility";
import * as store from "./dao";
import { createMcpRouter } from "./route";
import { createMcpManagementRouter } from "./management-route";
import { createRecruitingReader } from "./application/read-recruiting";
import { recruitingReadDependencies } from "./application/default-read-recruiting";
import { createRecruitingMcpServer } from "./tools";
const baseURL = getRequiredEnv("BETTER_AUTH_URL");
export const mcpRouter = createMcpRouter({
  auth,
  baseURL,
  ...store,
  createRequestWorkspaceAuthorizer,
  createServer: (context, scopes) =>
    createRecruitingMcpServer(createRecruitingReader(context, recruitingReadDependencies), scopes),
  resolveRecruitingVisibilityScope,
});
export const mcpManagementRouter = createMcpManagementRouter({
  auth,
  baseURL,
  createRequestWorkspaceAuthorizer,
  store,
  trustedOrigins,
});
