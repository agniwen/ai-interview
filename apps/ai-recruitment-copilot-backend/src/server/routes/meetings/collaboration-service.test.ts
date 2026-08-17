import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  editMeetingNote as editMeetingNoteWithDependencies,
  getMeetingNotes as getMeetingNotesWithDependencies,
  reassignSavedMeetingOwner as reassignSavedMeetingOwnerWithDependencies,
} from "./collaboration-service";
import type { MeetingCollaborationDependencies } from "./collaboration-service";

const mocks = {
  createMeetingNote: vi.fn(),
  deleteMeetingNote: vi.fn(),
  listMeetingAccessGrants: vi.fn(),
  listMeetingNotes: vi.fn(),
  loadMeetingSessionForAccess: vi.fn(),
  reassignMeetingOwner: vi.fn(),
  recordMeetingAudit: vi.fn(),
  replaceMeetingAccessGrants: vi.fn(),
  updateMeetingNote: vi.fn(),
};

const dependencies: MeetingCollaborationDependencies = {
  createNote: mocks.createMeetingNote,
  deleteNote: mocks.deleteMeetingNote,
  listAccessGrants: mocks.listMeetingAccessGrants,
  listNotes: mocks.listMeetingNotes,
  loadAuthorized: mocks.loadMeetingSessionForAccess,
  reassignOwner: mocks.reassignMeetingOwner,
  recordAudit: mocks.recordMeetingAudit,
  replaceAccessGrants: mocks.replaceMeetingAccessGrants,
  updateNote: mocks.updateMeetingNote,
};

function editMeetingNote(input: Parameters<typeof editMeetingNoteWithDependencies>[0]) {
  return editMeetingNoteWithDependencies(input, dependencies);
}

function getMeetingNotes(input: Parameters<typeof getMeetingNotesWithDependencies>[0]) {
  return getMeetingNotesWithDependencies(input, dependencies);
}

function reassignSavedMeetingOwner(
  input: Parameters<typeof reassignSavedMeetingOwnerWithDependencies>[0],
) {
  return reassignSavedMeetingOwnerWithDependencies(input, dependencies);
}

const timestamp = new Date("2026-08-09T06:00:00.000Z");
const baseMeeting = {
  assets: [{ durationMs: 15_000, track: "microphone" }],
  id: "meeting",
  ownerId: "owner",
  status: "ready",
  visibility: "restricted",
  workspaceCustodied: false,
};

describe("Meeting Note collaboration permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a former note author read-only after their meeting role becomes viewer", async () => {
    mocks.loadMeetingSessionForAccess.mockResolvedValue({
      ...baseMeeting,
      accessGrantRole: "viewer",
    });
    mocks.listMeetingNotes.mockResolvedValue([
      {
        authorId: "former-editor",
        authorName: "Former Editor",
        body: "历史记录",
        createdAt: timestamp,
        id: "note-1",
        meetingTimeMs: 1000,
        updatedAt: timestamp,
      },
    ]);

    await expect(
      getMeetingNotes({
        meetingId: "meeting",
        memberRole: "hr",
        organizationId: "org",
        userId: "former-editor",
      }),
    ).resolves.toEqual([
      expect.objectContaining({ canDelete: false, canEdit: false, id: "note-1" }),
    ]);
  });

  it("lets an editor revise an existing collaborative note", async () => {
    mocks.loadMeetingSessionForAccess.mockResolvedValue({
      ...baseMeeting,
      accessGrantRole: "editor",
    });
    mocks.updateMeetingNote.mockResolvedValue({
      authorId: "another-editor",
      authorName: "Another Editor",
      body: "协作修订后的记录",
      createdAt: timestamp,
      id: "note-2",
      meetingTimeMs: 5000,
      updatedAt: timestamp,
    });

    await expect(
      editMeetingNote({
        meetingId: "meeting",
        memberRole: "hr",
        note: { body: "协作修订后的记录" },
        noteId: "note-2",
        organizationId: "org",
        userId: "editor",
      }),
    ).resolves.toMatchObject({ canEdit: true, id: "note-2" });
    expect(mocks.updateMeetingNote).toHaveBeenCalledWith({
      actorId: "editor",
      canEditAll: true,
      canGovern: false,
      meetingId: "meeting",
      note: { body: "协作修订后的记录" },
      noteId: "note-2",
      organizationId: "org",
    });
  });

  it("lets an administrator reassign a workspace-custodied meeting", async () => {
    mocks.loadMeetingSessionForAccess.mockResolvedValue({
      ...baseMeeting,
      accessGrantRole: null,
      ownerId: "departed-owner",
      workspaceCustodied: true,
    });
    mocks.reassignMeetingOwner.mockResolvedValue("updated");

    await expect(
      reassignSavedMeetingOwner({
        meetingId: "meeting",
        memberRole: "admin",
        organizationId: "org",
        targetUserId: "new-owner",
        userId: "admin",
      }),
    ).resolves.toBe("updated");
    expect(mocks.reassignMeetingOwner).toHaveBeenCalledWith({
      actorId: "admin",
      meetingId: "meeting",
      organizationId: "org",
      userId: "new-owner",
    });
  });

  it("does not let an administrator displace an active meeting owner", async () => {
    mocks.loadMeetingSessionForAccess.mockResolvedValue({
      ...baseMeeting,
      accessGrantRole: null,
    });

    await expect(
      reassignSavedMeetingOwner({
        meetingId: "meeting",
        memberRole: "admin",
        organizationId: "org",
        targetUserId: "new-owner",
        userId: "admin",
      }),
    ).resolves.toBe("not-custodied");
    expect(mocks.reassignMeetingOwner).not.toHaveBeenCalled();
  });
});
