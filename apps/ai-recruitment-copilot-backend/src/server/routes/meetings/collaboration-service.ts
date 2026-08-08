import type {
  CreateMeetingNoteInput,
  MeetingAccessRole,
  MeetingGrantRole,
  MeetingNote,
  MeetingShareSettings,
  UpdateMeetingNoteInput,
  UpdateMeetingShareInput,
} from "@arc/shared/meeting-recording";
import type { loadMeetingSessionForAccess } from "./dao";
import {
  createMeetingNote,
  deleteMeetingNote,
  listMeetingAccessGrants,
  listMeetingNotes,
  reassignMeetingOwner,
  recordMeetingAudit,
  replaceMeetingAccessGrants,
  updateMeetingNote,
} from "./dao";
import { isWorkspaceAdministrator, meetingAccessCapabilities } from "./access";
import { loadAuthorizedMeeting, meetingRole } from "./authorized-meeting";

const ADMIN_ACCESS_AUDIT_DEDUPE_MS = 5 * 60 * 1000;

function sourceAssets<T extends { track: string }>(assets: T[]): T[] {
  return assets.filter((asset) => asset.track === "microphone" || asset.track === "system");
}

function serializeMeetingNote(
  note: {
    authorId: string | null;
    authorName: string;
    body: string;
    createdAt: Date;
    id: string;
    meetingTimeMs: number;
    updatedAt: Date;
  },
  access: { role: MeetingAccessRole; userId: string },
): MeetingNote {
  const isAuthor = note.authorId === access.userId;
  const canRevise = access.role !== "viewer";
  return {
    author: { id: note.authorId, name: note.authorName },
    body: note.body,
    canDelete: access.role === "administrator" || (isAuthor && canRevise),
    canEdit: canRevise,
    createdAt: note.createdAt.toISOString(),
    id: note.id,
    meetingTimeMs: note.meetingTimeMs,
    updatedAt: note.updatedAt.toISOString(),
  };
}

export async function getMeetingShareSettings(input: {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  userId: string;
}): Promise<MeetingShareSettings | "forbidden" | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!(meeting && meeting.owner)) {
    return null;
  }
  const role = meetingRole(meeting, input);
  if (!meetingAccessCapabilities(role).canManageSharing) {
    return "forbidden";
  }
  const grants = await listMeetingAccessGrants(input);
  if (role === "administrator") {
    await recordMeetingAudit({
      action: "meeting.share_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
  return {
    grants: grants.map((grant) => ({
      member: { id: grant.userId, image: grant.image, name: grant.name },
      role: grant.role as MeetingGrantRole,
    })),
    owner: {
      id: meeting.custodian?.id ?? meeting.owner.id,
      image: meeting.custodian?.image ?? meeting.owner.image,
      name: meeting.custodian?.name ?? meeting.owner.name,
    },
    visibility: meeting.visibility as "restricted" | "workspace",
    workspaceCustodied: meeting.workspaceCustodied,
  };
}

export async function updateMeetingShare(input: {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  share: UpdateMeetingShareInput;
  userId: string;
}): Promise<"forbidden" | "invalid-members" | "updated" | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  if (!meetingAccessCapabilities(meetingRole(meeting, input)).canManageSharing) {
    return "forbidden";
  }
  const updated = await replaceMeetingAccessGrants({
    actorId: input.userId,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    ownerId: meeting.custodianId ?? meeting.ownerId,
    share: input.share,
  });
  return updated ? "updated" : "invalid-members";
}

export async function reassignSavedMeetingOwner(input: {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  targetUserId: string;
  userId: string;
}): Promise<"forbidden" | "invalid-member" | "not-custodied" | "updated" | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  if (!isWorkspaceAdministrator(input.memberRole)) {
    return "forbidden";
  }
  if (!meeting.workspaceCustodied) {
    return "not-custodied";
  }
  return await reassignMeetingOwner({
    actorId: input.userId,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    userId: input.targetUserId,
  });
}

export async function getMeetingNotes(input: {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  userId: string;
}): Promise<MeetingNote[] | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  const role = meetingRole(meeting, input);
  if (role === "administrator") {
    await recordMeetingAudit({
      action: "meeting.notes_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
  const notes = await listMeetingNotes(input);
  return notes.map((note) => serializeMeetingNote(note, { role, userId: input.userId }));
}

function meetingDurationMs(
  meeting: NonNullable<Awaited<ReturnType<typeof loadMeetingSessionForAccess>>>,
): number {
  return Math.max(0, ...sourceAssets(meeting.assets).map((asset) => asset.durationMs));
}

export async function addMeetingNote(input: {
  meetingId: string;
  memberRole: string;
  note: CreateMeetingNoteInput;
  organizationId: string;
  userId: string;
  userName: string;
}): Promise<MeetingNote | "forbidden" | "invalid-time" | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  const role = meetingRole(meeting, input);
  if (!meetingAccessCapabilities(role).canCreateNotes) {
    return "forbidden";
  }
  if (input.note.meetingTimeMs > meetingDurationMs(meeting)) {
    return "invalid-time";
  }
  const note = await createMeetingNote({
    authorId: input.userId,
    authorName: input.userName,
    meetingId: input.meetingId,
    note: input.note,
    organizationId: input.organizationId,
  });
  return note ? serializeMeetingNote(note, { role, userId: input.userId }) : null;
}

export async function editMeetingNote(input: {
  meetingId: string;
  memberRole: string;
  note: UpdateMeetingNoteInput;
  noteId: string;
  organizationId: string;
  userId: string;
}): Promise<MeetingNote | "forbidden" | "invalid-time" | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  const role = meetingRole(meeting, input);
  if (!meetingAccessCapabilities(role).canEditNotes) {
    return "forbidden";
  }
  if (
    input.note.meetingTimeMs !== undefined &&
    input.note.meetingTimeMs > meetingDurationMs(meeting)
  ) {
    return "invalid-time";
  }
  const note = await updateMeetingNote({
    actorId: input.userId,
    canEditAll: meetingAccessCapabilities(role).canEditNotes,
    canGovern: role === "administrator",
    meetingId: input.meetingId,
    note: input.note,
    noteId: input.noteId,
    organizationId: input.organizationId,
  });
  return note ? serializeMeetingNote(note, { role, userId: input.userId }) : "forbidden";
}

export async function removeMeetingNote(input: {
  meetingId: string;
  memberRole: string;
  noteId: string;
  organizationId: string;
  userId: string;
}): Promise<"deleted" | "forbidden" | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  const role = meetingRole(meeting, input);
  if (!meetingAccessCapabilities(role).canCreateNotes) {
    return "forbidden";
  }
  const deleted = await deleteMeetingNote({
    canGovern: role === "administrator",
    meetingId: input.meetingId,
    noteId: input.noteId,
    organizationId: input.organizationId,
    userId: input.userId,
  });
  return deleted ? "deleted" : "forbidden";
}
