import { afterEach, describe, expect, it, vi } from "vitest";
import {
  signManualInvitationPreview,
  verifyManualInvitationPreview,
} from "../application/default-manual-ai-invitation";

const actor = { actorUserId: "hr", organizationId: "org", roundId: "round" };
afterEach(() => vi.unstubAllEnvs());
function token(expiresAt = Date.now() + 60_000) {
  vi.stubEnv("BETTER_AUTH_SECRET", "manual-invitation-test-secret");
  return signManualInvitationPreview({
    ...actor,
    expiresAt,
    fingerprint: "snapshot",
    requestId: "4b21611a-c4e9-4c7a-8c0a-4fdd65dd0bf6",
  });
}
describe("manual invitation preview authorization", () => {
  it("accepts an intact preview for the same HR, workspace and round", () => {
    expect(verifyManualInvitationPreview(token(), actor).fingerprint).toBe("snapshot");
  });
  it("rejects tampering", () => {
    expect(() => verifyManualInvitationPreview(`${token()}changed`, actor)).toThrow();
  });
  it.each([{ actorUserId: "other" }, { organizationId: "other" }, { roundId: "other" }])(
    "rejects changed scope %o",
    (other) => {
      expect(() => verifyManualInvitationPreview(token(), { ...actor, ...other })).toThrow();
    },
  );
  it("rejects an expired preview", () => {
    expect(() => verifyManualInvitationPreview(token(Date.now() - 1), actor)).toThrow();
  });
});
