import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@arc/ai-recruitment-copilot-backend/lib/server/auth";

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
