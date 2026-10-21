import { describe, expect, it } from "vitest";
import { addUserWorkspaceSchema } from "../schema";

describe("addUserWorkspaceSchema", () => {
  it.each(["member", "admin", "noAccess"])("accepts the whitelisted role %s", (role) => {
    expect(addUserWorkspaceSchema.safeParse({ organizationId: "org-1", role }).success).toBe(true);
  });

  it.each(["owner", "hr", "recruitingLead", "", undefined])(
    "rejects the non-whitelisted role %s",
    (role) => {
      expect(addUserWorkspaceSchema.safeParse({ organizationId: "org-1", role }).success).toBe(
        false,
      );
    },
  );
});
