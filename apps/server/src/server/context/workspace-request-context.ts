import type { Env } from "../type";

type WorkspaceVariables = Env["Variables"];

export interface WorkspaceRequestContext {
  member: NonNullable<WorkspaceVariables["member"]>;
  organization: NonNullable<WorkspaceVariables["activeOrg"]>;
  user: NonNullable<WorkspaceVariables["user"]>;
}

export class WorkspaceContextInvariantError extends Error {
  constructor() {
    super("Workspace request context is unavailable after workspace middleware.");
    this.name = "WorkspaceContextInvariantError";
  }
}

interface WorkspaceContextSource {
  var: Env["Variables"];
}

export function getWorkspaceRequestContext(c: WorkspaceContextSource): WorkspaceRequestContext {
  const { activeOrg, member, user } = c.var;
  if (!(activeOrg && member && user)) {
    throw new WorkspaceContextInvariantError();
  }

  return { member, organization: activeOrg, user };
}
