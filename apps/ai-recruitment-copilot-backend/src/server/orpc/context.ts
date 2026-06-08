import type { auth } from "@arc/ai-recruitment-copilot-backend/lib/server/auth";

export interface ORPCContext {
  headers: Headers;
  request?: Request;
  session?: typeof auth.$Infer.Session.session | null;
  user?: typeof auth.$Infer.Session.user | null;
}
