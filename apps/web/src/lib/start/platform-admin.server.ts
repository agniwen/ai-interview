import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@app/server/web/runtime";

export type PlatformAdminState =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "ready" };

export async function getPlatformAdminStateFromRequest(): Promise<PlatformAdminState> {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user) {
    return { status: "unauthenticated" };
  }
  if (session.user.role !== "admin") {
    return { status: "forbidden" };
  }
  return { status: "ready" };
}
