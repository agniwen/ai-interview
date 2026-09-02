import type {
  CreateMeetingNoteInput,
  MeetingAccessRole,
  MeetingGrantRole,
  MeetingNote,
  MeetingShareSettings,
  UpdateMeetingNoteInput,
  UpdateMeetingShareInput,
} from "@app/shared/meeting-recording";
import { z } from "zod";
import {
  listMeetingAccessGrants,
  reassignMeetingOwner,
  recordMeetingAudit,
  replaceMeetingAccessGrants,
} from "./dao";
import { isWorkspaceAdministrator, meetingAccessCapabilities } from "./access";
import { loadAuthorizedMeeting, meetingRole } from "./authorized-meeting";
import type { MeetingAuthorizedSession } from "./service-dependencies";
import {
  createMeetingNote,
  deleteMeetingNote,
  listMeetingNotes,
  updateMeetingNote,
} from "./routes/notes/dao";

const ADMIN_ACCESS_AUDIT_DEDUPE_MS = 5 * 60 * 1000;
const meetingGrantRoleSchema = z.enum(["editor", "viewer"]);
const meetingVisibilitySchema = z.enum(["restricted", "workspace"]);

type MeetingNoteResult =
  | "limit-exceeded"
  | {
      authorId: string | null;
      authorName: string;
      body: string;
      createdAt: Date;
      id: string;
      meetingTimeMs: number;
      updatedAt: Date;
    }
  | undefined;
type MeetingNoteRecord = Exclude<MeetingNoteResult, "limit-exceeded" | undefined>;

export interface MeetingCollaborationDependencies {
  createNote: (...args: Parameters<typeof createMeetingNote>) => Promise<MeetingNoteResult>;
  deleteNote: typeof deleteMeetingNote;
  listAccessGrants: typeof listMeetingAccessGrants;
  listNotes: (...args: Parameters<typeof listMeetingNotes>) => Promise<MeetingNoteRecord[]>;
  loadAuthorized: (
    ...args: Parameters<typeof loadAuthorizedMeeting>
  ) => Promise<MeetingAuthorizedSession | null>;
  reassignOwner: typeof reassignMeetingOwner;
  recordAudit: typeof recordMeetingAudit;
  replaceAccessGrants: typeof replaceMeetingAccessGrants;
  updateNote: typeof updateMeetingNote;
}

const defaultDependencies: MeetingCollaborationDependencies = {
  createNote: createMeetingNote,
  deleteNote: deleteMeetingNote,
  listAccessGrants: listMeetingAccessGrants,
  listNotes: listMeetingNotes,
  loadAuthorized: loadAuthorizedMeeting,
  reassignOwner: reassignMeetingOwner,
  recordAudit: recordMeetingAudit,
  replaceAccessGrants: replaceMeetingAccessGrants,
  updateNote: updateMeetingNote,
};

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

export async function getMeetingShareSettings(
  input: {
    meetingId: string;
    memberRole: string;
    organizationId: string;
    userId: string;
  },
  dependencies: MeetingCollaborationDependencies = defaultDependencies,
): Promise<MeetingShareSettings | "forbidden" | null> {
  const meeting = await dependencies.loadAuthorized(input);
  if (!(meeting && meeting.owner && meeting.workspaceCustodied !== undefined)) {
    return null;
  }
  const role = meetingRole(meeting, input);
  if (!meetingAccessCapabilities(role).canManageSharing) {
    return "forbidden";
  }
  const grants = await dependencies.listAccessGrants(input);
  if (role === "administrator") {
    await dependencies.recordAudit({
      action: "meeting.share_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
  return {
    grants: grants.flatMap((grant) => {
      const roleResult = meetingGrantRoleSchema.safeParse(grant.role);
      return roleResult.success
        ? [
            {
              member: { id: grant.userId, image: grant.image, name: grant.name },
              role: roleResult.data satisfies MeetingGrantRole,
            },
          ]
        : [];
    }),
    owner: {
      id: meeting.custodian?.id ?? meeting.owner.id,
      image: meeting.custodian?.image ?? meeting.owner.image,
      name: meeting.custodian?.name ?? meeting.owner.name,
    },
    visibility: meetingVisibilitySchema.parse(meeting.visibility),
    workspaceCustodied: meeting.workspaceCustodied,
  };
}

export async function updateMeetingShare(
  input: {
    meetingId: string;
    memberRole: string;
    organizationId: string;
    share: UpdateMeetingShareInput;
    userId: string;
  },
  dependencies: MeetingCollaborationDependencies = defaultDependencies,
): Promise<"forbidden" | "invalid-members" | "updated" | null> {
  const meeting = await dependencies.loadAuthorized(input);
  if (!meeting) {
    return null;
  }
  if (!meetingAccessCapabilities(meetingRole(meeting, input)).canManageSharing) {
    return "forbidden";
  }
  const updated = await dependencies.replaceAccessGrants({
    actorId: input.userId,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    ownerId: meeting.custodianId ?? meeting.ownerId,
    share: input.share,
  });
  return updated ? "updated" : "invalid-members";
}

export async function reassignSavedMeetingOwner(
  input: {
    meetingId: string;
    memberRole: string;
    organizationId: string;
    targetUserId: string;
    userId: string;
  },
  dependencies: MeetingCollaborationDependencies = defaultDependencies,
): Promise<"forbidden" | "invalid-member" | "not-custodied" | "updated" | null> {
  const meeting = await dependencies.loadAuthorized(input);
  if (!meeting) {
    return null;
  }
  if (!isWorkspaceAdministrator(input.memberRole)) {
    return "forbidden";
  }
  if (!meeting.workspaceCustodied) {
    return "not-custodied";
  }
  return await dependencies.reassignOwner({
    actorId: input.userId,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    userId: input.targetUserId,
  });
}

export async function getMeetingNotes(
  input: {
    meetingId: string;
    memberRole: string;
    organizationId: string;
    userId: string;
  },
  dependencies: MeetingCollaborationDependencies = defaultDependencies,
): Promise<MeetingNote[] | null> {
  const meeting = await dependencies.loadAuthorized(input);
  if (!meeting) {
    return null;
  }
  const role = meetingRole(meeting, input);
  if (role === "administrator") {
    await dependencies.recordAudit({
      action: "meeting.notes_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
  const notes = await dependencies.listNotes(input);
  return notes.map((note) => serializeMeetingNote(note, { role, userId: input.userId }));
}

function meetingDurationMs(meeting: MeetingAuthorizedSession): number {
  return Math.max(0, ...sourceAssets(meeting.assets).map((asset) => asset.durationMs ?? 0));
}

export async function addMeetingNote(
  input: {
    meetingId: string;
    memberRole: string;
    note: CreateMeetingNoteInput;
    organizationId: string;
    userId: string;
    userName: string;
  },
  dependencies: MeetingCollaborationDependencies = defaultDependencies,
): Promise<MeetingNote | "forbidden" | "invalid-time" | "limit-exceeded" | null> {
  const meeting = await dependencies.loadAuthorized(input);
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
  const note = await dependencies.createNote({
    authorId: input.userId,
    authorName: input.userName,
    meetingId: input.meetingId,
    note: input.note,
    organizationId: input.organizationId,
  });
  if (note === "limit-exceeded") {
    return note;
  }
  return note ? serializeMeetingNote(note, { role, userId: input.userId }) : null;
}

export async function editMeetingNote(
  input: {
    meetingId: string;
    memberRole: string;
    note: UpdateMeetingNoteInput;
    noteId: string;
    organizationId: string;
    userId: string;
  },
  dependencies: MeetingCollaborationDependencies = defaultDependencies,
): Promise<MeetingNote | "forbidden" | "invalid-time" | "limit-exceeded" | null> {
  const meeting = await dependencies.loadAuthorized(input);
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
  const note = await dependencies.updateNote({
    actorId: input.userId,
    canEditAll: meetingAccessCapabilities(role).canEditNotes,
    canGovern: role === "administrator",
    meetingId: input.meetingId,
    note: input.note,
    noteId: input.noteId,
    organizationId: input.organizationId,
  });
  if (note === "limit-exceeded") {
    return note;
  }
  return note ? serializeMeetingNote(note, { role, userId: input.userId }) : "forbidden";
}

export async function removeMeetingNote(
  input: {
    meetingId: string;
    memberRole: string;
    noteId: string;
    organizationId: string;
    userId: string;
  },
  dependencies: MeetingCollaborationDependencies = defaultDependencies,
): Promise<"deleted" | "forbidden" | null> {
  const meeting = await dependencies.loadAuthorized(input);
  if (!meeting) {
    return null;
  }
  const role = meetingRole(meeting, input);
  if (!meetingAccessCapabilities(role).canCreateNotes) {
    return "forbidden";
  }
  const deleted = await dependencies.deleteNote({
    canGovern: role === "administrator",
    meetingId: input.meetingId,
    noteId: input.noteId,
    organizationId: input.organizationId,
    userId: input.userId,
  });
  return deleted ? "deleted" : "forbidden";
}
