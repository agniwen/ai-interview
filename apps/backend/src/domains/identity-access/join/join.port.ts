export const JOIN_PORT = Symbol("JOIN_PORT");
export const JOIN_EFFECTS_PORT = Symbol("JOIN_EFFECTS_PORT");
export const JOIN_NOTIFICATION_PORT = Symbol("JOIN_NOTIFICATION_PORT");

export interface JoinPreview {
  valid: boolean;
  initialRole?: string;
  workspace?: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  };
  alreadyMember?: boolean;
}

export interface JoinAcceptResult {
  status: "joined" | "already_member";
  organizationId: string;
  organizationSlug: string;
  role: string;
}

export class InvalidJoinLinkError extends Error {
  override readonly name = "InvalidJoinLinkError";
}

export interface JoinPort {
  preview(input: { code: string; userId: string | null }): Promise<JoinPreview>;
  accept(input: { code: string; userId: string }): Promise<JoinAcceptResult>;
}

export interface JoinEffectsPort {
  addMemberToDefaultRecruitingGroup(input: {
    createdBy: string | null;
    organizationId: string;
    userId: string;
  }): Promise<void>;
  notifyInviteCreatorMemberJoined(input: {
    creatorUserId: string | null;
    joinedUserId: string;
    organizationId: string;
  }): Promise<void>;
}

export interface JoinNotificationPort {
  notifyInviteCreatorMemberJoined(input: {
    creatorUserId: string | null;
    joinedUserId: string;
    organizationId: string;
  }): Promise<void>;
}
