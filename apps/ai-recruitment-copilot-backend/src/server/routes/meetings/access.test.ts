import { describe, expect, it } from "vitest";
import { meetingAccessCapabilities, resolveMeetingAccessRole } from "./access";

describe("Meeting Access Role", () => {
  it("keeps workspace administrators above ownership and explicit grants", () => {
    expect(
      resolveMeetingAccessRole({
        grantRole: "viewer",
        isOwner: false,
        isWorkspaceAdministrator: true,
        visibility: "restricted",
      }),
    ).toBe("administrator");
  });

  it("prefers owner and editor roles over workspace-wide viewer access", () => {
    expect(
      resolveMeetingAccessRole({
        grantRole: null,
        isOwner: true,
        isWorkspaceAdministrator: false,
        visibility: "workspace",
      }),
    ).toBe("owner");
    expect(
      resolveMeetingAccessRole({
        grantRole: "editor",
        isOwner: false,
        isWorkspaceAdministrator: false,
        visibility: "workspace",
      }),
    ).toBe("editor");
  });

  it("does not grant restricted meetings to unrelated workspace members", () => {
    expect(
      resolveMeetingAccessRole({
        grantRole: null,
        isOwner: false,
        isWorkspaceAdministrator: false,
        visibility: "restricted",
      }),
    ).toBeNull();
  });

  it("allows editors to author notes while viewers remain read-only", () => {
    expect(meetingAccessCapabilities("editor")).toMatchObject({
      canCreateNotes: true,
      canEditNotes: true,
      canExport: false,
      canManageSharing: false,
      canRead: true,
      canRetryProcessing: false,
    });
    expect(meetingAccessCapabilities("viewer")).toMatchObject({
      canCreateNotes: false,
      canDeleteMeeting: false,
      canEditNotes: false,
      canExport: false,
      canManageSharing: false,
      canRead: true,
    });
  });
});
