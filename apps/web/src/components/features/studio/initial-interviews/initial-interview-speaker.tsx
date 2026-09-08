import { Blobatar } from "@blobatar/react";
import "blobatar/motion.css";
import { cn } from "@app/shared/utils";

export interface MeetingSpeakerProfile {
  avatarId: string;
  label: string;
}

interface MeetingSpeakerTurn {
  speakerDisplayName?: string | null;
  speakerKey?: string;
}

export const UNKNOWN_MEETING_SPEAKER: MeetingSpeakerProfile = {
  avatarId: "meeting:unknown-speaker",
  label: "未知说话人",
};

export function createMeetingSpeakerProfiles(
  turns: MeetingSpeakerTurn[],
  scopeId: string,
): Map<string, MeetingSpeakerProfile> {
  const profiles = new Map<string, MeetingSpeakerProfile>();
  for (const turn of turns) {
    if (!turn.speakerKey) {
      continue;
    }
    const displayName = turn.speakerDisplayName?.trim();
    const confirmedDisplayName = displayName === "待确认" ? null : displayName;
    const existing = profiles.get(turn.speakerKey);
    if (existing) {
      if (confirmedDisplayName && existing.label !== confirmedDisplayName) {
        profiles.set(turn.speakerKey, { ...existing, label: confirmedDisplayName });
      }
      continue;
    }
    const speakerNumber = profiles.size + 1;
    profiles.set(turn.speakerKey, {
      // Provider keys are canonicalized after upload; the meeting-local ordinal stays stable.
      avatarId: `${scopeId}:speaker-${speakerNumber}`,
      label: confirmedDisplayName || `说话人${speakerNumber}`,
    });
  }
  return profiles;
}

export function MeetingSpeakerLabel({
  className,
  profile = UNKNOWN_MEETING_SPEAKER,
}: {
  className?: string;
  profile?: MeetingSpeakerProfile;
}) {
  const isUnknownSpeaker = profile.avatarId === UNKNOWN_MEETING_SPEAKER.avatarId;
  return (
    <div className={cn("flex items-center gap-1.5 text-muted-foreground text-xs", className)}>
      {isUnknownSpeaker ? (
        <Blobatar
          animate="hover"
          aria-hidden="true"
          background={false}
          className="size-5 shrink-0"
          data-meeting-speaker-avatar="true"
          name="alain00"
          size={20}
          // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- Blobatar names its silhouette-selection trait "shape".
          traits={{ shape: 0.11 }}
        />
      ) : (
        <Blobatar
          alt=""
          background={false}
          className="size-5 shrink-0"
          data-meeting-speaker-avatar="true"
          name={profile.avatarId}
          size={20}
        />
      )}
      <span>{profile.label}</span>
    </div>
  );
}
