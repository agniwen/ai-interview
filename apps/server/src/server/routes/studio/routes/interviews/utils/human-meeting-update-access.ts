import {
  getWorkspaceRequestContext,
  WorkspaceContextInvariantError,
} from "@app/server/server/context/workspace-request-context";
import { factory } from "@app/server/server/factory";

interface ResolveAccessInput {
  headers: Headers;
  meetingId: string;
  memberRole: string | null | undefined;
  organizationId: string;
  userId: string;
}

export interface HumanMeetingUpdateAccessDependencies {
  canUpdateHumanInterviews(input: ResolveAccessInput): Promise<boolean>;
}

const defaultDependencies: HumanMeetingUpdateAccessDependencies = {
  canUpdateHumanInterviews: async (input) => {
    const { createRequestWorkspaceAuthorizer } =
      await import("@app/server/server/access/workspace-access-policy");
    const authorize = createRequestWorkspaceAuthorizer({
      headers: input.headers,
      memberRole: input.memberRole,
      organizationId: input.organizationId,
      userId: input.userId,
    });
    return authorize({ action: "update", resource: "humanInterview" });
  },
};

export function resolveHumanMeetingUpdateAccess(
  input: ResolveAccessInput,
  dependencies: HumanMeetingUpdateAccessDependencies = defaultDependencies,
): Promise<boolean> {
  return dependencies.canUpdateHumanInterviews(input);
}

export function requireHumanMeetingUpdateAccess(
  dependencies: HumanMeetingUpdateAccessDependencies = defaultDependencies,
) {
  return factory.createMiddleware(async (c, next) => {
    let workspaceContext;
    try {
      workspaceContext = getWorkspaceRequestContext(c);
    } catch (error) {
      if (error instanceof WorkspaceContextInvariantError) {
        return c.json({ message: "Forbidden" }, 403);
      }
      throw error;
    }
    const meetingId = c.req.param("meetingId");
    if (!meetingId) {
      return c.json({ message: "Forbidden" }, 403);
    }
    const allowed = await resolveHumanMeetingUpdateAccess(
      {
        headers: c.req.raw.headers,
        meetingId,
        memberRole: workspaceContext.member.role,
        organizationId: workspaceContext.organization.id,
        userId: workspaceContext.user.id,
      },
      dependencies,
    );
    return allowed ? next() : c.json({ message: "Forbidden" }, 403);
  });
}
