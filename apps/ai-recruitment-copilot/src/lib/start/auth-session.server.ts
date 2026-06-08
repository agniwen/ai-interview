import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import type {
  ActiveOrganizationState,
  WorkspaceAccessState,
  WorkspaceSelectionState,
} from "./auth-session";
import { auth } from "@arc/ai-recruitment-copilot-backend/lib/server/auth";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { user as userTable } from "@arc/db-schema/schema";

export async function getActiveOrganizationStateFromRequest(): Promise<ActiveOrganizationState> {
  const requestHeaders = getRequestHeaders();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) {
    return { status: "unauthenticated" };
  }

  const organizations = await auth.api.listOrganizations({ headers: requestHeaders });
  const activeId = (session.session as { activeOrganizationId?: string | null } | null)
    ?.activeOrganizationId;
  if (!activeId) {
    return { status: "no_active_workspace" };
  }

  const active = organizations.find((organization) => organization.id === activeId);
  if (!active) {
    return { status: "no_active_workspace" };
  }

  return {
    status: "ready",
    workspace: {
      id: active.id,
      slug: active.slug,
    },
  };
}

export async function getWorkspaceSelectionStateFromRequest(): Promise<WorkspaceSelectionState> {
  const requestHeaders = getRequestHeaders();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) {
    return { status: "unauthenticated" };
  }

  const organizations = await auth.api.listOrganizations({ headers: requestHeaders });

  return {
    organizations: organizations.map((organization) => ({
      id: organization.id,
      logo: organization.logo ?? null,
      name: organization.name,
      slug: organization.slug,
    })),
    status: "ready",
    user: {
      email: session.user.email,
      image: session.user.image,
      name: session.user.name,
    },
  };
}

async function resolveWorkspaceAccess(
  requestHeaders: Headers,
  slug: string,
): Promise<WorkspaceAccessState> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) {
    return { status: "unauthenticated" };
  }

  const organizations = await auth.api.listOrganizations({ headers: requestHeaders });
  const matched = organizations.find((organization) => organization.slug === slug);
  if (!matched) {
    return { status: "not_found" };
  }

  const activeOrgId = (session.session as { activeOrganizationId?: string | null } | null)
    ?.activeOrganizationId;
  if (activeOrgId !== matched.id) {
    await auth.api.setActiveOrganization({
      body: { organizationId: matched.id },
      headers: requestHeaders,
    });
  }

  await db
    .update(userTable)
    .set({ lastActiveOrganizationId: matched.id })
    .where(
      and(
        eq(userTable.id, session.user.id),
        or(
          isNull(userTable.lastActiveOrganizationId),
          ne(userTable.lastActiveOrganizationId, matched.id),
        ),
      ),
    );

  return {
    status: "ready",
    workspace: {
      id: matched.id,
      slug: matched.slug,
    },
  };
}

export async function resolveWorkspaceAccessFromRequest(
  slug: string,
): Promise<WorkspaceAccessState> {
  return await resolveWorkspaceAccess(getRequestHeaders(), slug);
}
