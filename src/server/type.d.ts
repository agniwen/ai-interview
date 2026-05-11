import type { auth } from "~/lib/auth";
import type { member, organization } from "@/lib/shared/db/schema";

type OrganizationRow = typeof organization.$inferSelect;
type MemberRow = typeof member.$inferSelect;

export interface Env {
  Variables: {
    activeOrg: OrganizationRow | null;
    member: MemberRow | null;
    session: typeof auth.$Infer.Session.session | null;
    user: typeof auth.$Infer.Session.user | null;
  };
}
