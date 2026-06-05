import "server-only";

import type { PlatformAnalyticsDirectory } from "@/lib/shared/platform-analytics";
import { db } from "@/lib/server/db";
import { organization, user } from "@arc/db-schema/schema";

export async function loadPlatformAnalyticsDirectory(): Promise<PlatformAnalyticsDirectory> {
  const [users, workspaces] = await Promise.all([
    db
      .select({
        email: user.email,
        id: user.id,
        image: user.image,
        name: user.name,
      })
      .from(user),
    db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization),
  ]);

  return {
    users: Object.fromEntries(users.map((row) => [row.id, row])),
    workspaces: Object.fromEntries(workspaces.map((row) => [row.id, row])),
  };
}
