"use client";

import { useIsSpeaking } from "@livekit/components-react";
import type { Participant } from "livekit-client";
import { useContext } from "react";
import { z } from "zod";
import { cn } from "@app/shared/utils";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MeetingViewerContext, resolveCandidateAvatarUrl } from "./meeting-participant-avatars";

const participantMetadataSchema = z.object({
  avatar_url: z.string().nullable().optional(),
  avatar_version: z.string().nullable().optional(),
  interview_record_id: z.string().optional(),
  participant_role: z.string().optional(),
  participant_type: z.string().optional(),
});

export function parseParticipantMetadata(
  metadata: string | undefined,
): z.infer<typeof participantMetadataSchema> {
  if (!metadata) {
    return {};
  }
  try {
    const parsed = participantMetadataSchema.safeParse(JSON.parse(metadata));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function isCandidateParticipant(participant: Participant): boolean {
  const metadata = parseParticipantMetadata(participant.metadata);
  return metadata.participant_type === "candidate" || participant.identity.startsWith("candidate_");
}

export function getParticipantRoleLabel(participant: Participant): string {
  if (isCandidateParticipant(participant)) {
    return "候选人";
  }
  const role = parseParticipantMetadata(participant.metadata).participant_role;
  if (role === "host") {
    return "主持人";
  }
  if (role === "observer") {
    return "旁听";
  }
  return "面试官";
}

function RosterItem({ participant }: { participant: Participant }) {
  const viewer = useContext(MeetingViewerContext);
  const isSpeaking = useIsSpeaking(participant);
  const metadata = parseParticipantMetadata(participant.metadata);
  const isCandidate = isCandidateParticipant(participant);
  const name = participant.name?.trim() || (isCandidate ? "候选人" : "面试官");
  const image = isCandidate
    ? resolveCandidateAvatarUrl(viewer, metadata)
    : metadata.avatar_url?.trim() || null;
  const roleLabel = getParticipantRoleLabel(participant);
  const label = `${name}${participant.isLocal ? "（我）" : ""} · ${roleLabel}${isSpeaking ? " · 正在说话" : ""}`;

  return (
    <li
      aria-label={label}
      className="relative isolate flex w-9 shrink-0 flex-col items-center pb-1"
      data-speaking={isSpeaking}
      title={label}
    >
      {/* 正在说话时换成绿色描边，与参会画面一致。/ A green ring marks the speaker, matching the tiles. */}
      <Avatar
        aria-hidden
        className={cn(
          "size-7 ring-2 transition-shadow duration-200",
          isSpeaking ? "ring-green" : "ring-background",
        )}
        seed={isCandidate ? name || "未命名候选人" : participant.identity}
      >
        {image ? <AvatarImage alt="" src={image} /> : null}
      </Avatar>
      {/* 名称标记压在头像下沿之上，用实底避免透出头像。/ A solid name mark over the avatar's lower edge. */}
      <Badge
        aria-hidden
        className="absolute bottom-0 z-10 block h-3 max-w-full truncate rounded-[3px] border-border bg-background px-0.5 text-[8px] text-foreground leading-[10px] shadow-xs"
        variant="outline"
      >
        {name}
      </Badge>
    </li>
  );
}

/** 顶栏参会人：头像一字排开，下方小标记名称，说话的人绿色描边。 / Header roster with name marks and a speaking ring. */
export function MeetingParticipantRoster({ participants }: { participants: Participant[] }) {
  const ordered = participants.toSorted(
    (a, b) => Number(isCandidateParticipant(b)) - Number(isCandidateParticipant(a)),
  );
  return (
    <ul aria-label={`参会人（${participants.length}）`} className="flex items-center gap-1">
      {ordered.map((participant) => (
        <RosterItem key={participant.identity} participant={participant} />
      ))}
    </ul>
  );
}
