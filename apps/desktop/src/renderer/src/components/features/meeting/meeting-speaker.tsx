import { Blobatar } from "@blobatar/react";
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

const UNKNOWN_MEETING_SPEAKER_HUE = 260;

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
    const existing = profiles.get(turn.speakerKey);
    if (existing) {
      if (displayName && existing.label !== displayName) {
        profiles.set(turn.speakerKey, { ...existing, label: displayName });
      }
      continue;
    }
    profiles.set(turn.speakerKey, {
      avatarId: `${scopeId}:${turn.speakerKey}`,
      label: displayName || `说话人${profiles.size + 1}`,
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
      <Blobatar
        alt=""
        background={isUnknownSpeaker ? "circle" : undefined}
        className="size-5 shrink-0"
        data-meeting-speaker-avatar="true"
        hue={isUnknownSpeaker ? UNKNOWN_MEETING_SPEAKER_HUE : undefined}
        name={profile.avatarId}
        size={20}
      />
      <span>{profile.label}</span>
    </div>
  );
}
