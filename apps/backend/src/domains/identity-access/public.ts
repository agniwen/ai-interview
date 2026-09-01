export {
  IDENTITY_ADMINISTRATION_COMMANDS,
  type IdentityAdministrationError,
  type IdentityAdministrationCommands,
  type IdentityAdministrationResult,
  type IdentityAdministrationUserRemark,
} from "./administration/identity-administration.commands.js";
export {
  RECRUITING_SCOPE_QUERIES,
  type RecruitingScopeQueries,
} from "./recruiting-scope/recruiting-scope.queries.js";
export {
  WORKSPACE_AUTHORIZATION_QUERIES,
  type WorkspaceActor,
  type WorkspaceAuthorizationContext,
  type WorkspaceAuthorizationQueries,
  type WorkspaceMemberContext,
  type WorkspaceOrganizationContext,
  type WorkspacePermission,
} from "./workspace-authorization/workspace-authorization.queries.js";
