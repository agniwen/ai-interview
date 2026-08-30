import { describe, expect, it } from "vitest";
import { inviteLinkCreateInputSchema } from "./schema";

describe("inviteLinkCreateInputSchema", () => {
  it("allows creating a shared invitation without an email", () => {
    expect(inviteLinkCreateInputSchema.parse({ initialRole: "member" })).toEqual({
      initialRole: "member",
    });
  });

  it("normalizes an optional delivery email", () => {
    expect(
      inviteLinkCreateInputSchema.parse({
        email: " Colleague@Example.com ",
        initialRole: "member",
      }),
    ).toEqual({ email: "colleague@example.com", initialRole: "member" });
  });

  it("rejects malformed delivery emails", () => {
    expect(
      inviteLinkCreateInputSchema.safeParse({ email: "not-an-email", initialRole: "member" })
        .success,
    ).toBe(false);
  });
});
