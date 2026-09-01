/* oxlint-disable typescript/no-namespace -- Express request augmentation uses its published global namespace. */
import type { BackendAuthSession } from "./better-auth.factory.js";

export interface AuthContext {
  session: BackendAuthSession["session"];
  user: BackendAuthSession["user"];
}

declare global {
  namespace Express {
    interface Request {
      authContext: AuthContext | null;
    }
  }
}
