import { describe, expect, it } from "vitest";
import { resolveInternalNotificationUserIds } from "./recipient-policy";

describe("interview notification recipient policy", () => {
  it("uses the initiator only when HR selected nobody", () => {
    expect(
      resolveInternalNotificationUserIds({
        audienceType: "initiator_fallback",
        initiatorUserId: "initiator_1",
        selectedUserIds: [],
      }),
    ).toEqual(["initiator_1"]);
  });

  it("never falls back when explicit recipients exist", () => {
    const selectedUserIds = ["selected_unbound_1", "selected_bound_2"];
    expect(
      resolveInternalNotificationUserIds({
        audienceType: "selected_hr_user",
        initiatorUserId: "initiator_1",
        selectedUserIds,
      }),
    ).toEqual(selectedUserIds);
    expect(
      resolveInternalNotificationUserIds({
        audienceType: "initiator_fallback",
        initiatorUserId: "initiator_1",
        selectedUserIds,
      }),
    ).toEqual([]);
  });
});
