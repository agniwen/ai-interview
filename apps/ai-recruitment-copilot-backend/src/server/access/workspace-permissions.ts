import { auth } from "@arc/ai-recruitment-copilot-backend/lib/server/auth";
import type { statement } from "@arc/shared/permissions";

type Resource = keyof typeof statement;
type Action<R extends Resource> = (typeof statement)[R][number];

/**
 * Check a permission against the organization resolved for this request.
 *
 * Better Auth falls back to mutable session-wide organization state when the
 * id is omitted. That fallback is unsafe for URL-scoped multi-workspace requests:
 * another browser tab can mutate the session between scope resolution and this
 * check. Keep the explicit organization id mandatory at this single boundary.
 */
export async function hasWorkspacePermission<R extends Resource>({
  action,
  headers,
  organizationId,
  resource,
}: {
  action: Action<R>;
  headers: Headers;
  organizationId: string;
  resource: R;
}): Promise<boolean> {
  const result = await auth.api.hasPermission({
    body: {
      organizationId,
      permissions: { [resource]: [action] } as Record<string, string[]>,
    },
    headers,
  });
  return result.success;
}
