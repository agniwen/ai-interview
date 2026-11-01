"use client";

import { createContext, useState } from "react";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import {
  getHumanInterviewCandidateAvatarUrl,
  getHumanInterviewOwnCandidateAvatarUrl,
} from "@/lib/client/api/endpoints/human-interview-candidate-materials";
import { cn } from "@app/shared/utils";

interface MeetingViewer {
  inviteToken: string;
  mode: "candidate" | "interviewer";
}

// 参会画面按查看者自己的链接取候选人头像：面试官走资料接口，候选人走本人入会链接。
// / Tiles fetch the candidate headshot with the viewer's own link.
export const MeetingViewerContext = createContext<MeetingViewer>({
  inviteToken: "",
  mode: "candidate",
});

export function resolveCandidateAvatarUrl(
  viewer: MeetingViewer,
  metadata: { avatar_version?: string | null; interview_record_id?: string },
): string | null {
  const version = metadata.avatar_version;
  if (!(version && viewer.inviteToken)) {
    return null;
  }
  if (viewer.mode === "candidate") {
    return getHumanInterviewOwnCandidateAvatarUrl(viewer.inviteToken, version);
  }
  return metadata.interview_record_id
    ? getHumanInterviewCandidateAvatarUrl(viewer.inviteToken, metadata.interview_record_id, version)
    : null;
}

/**
 * 候选人关闭摄像头时的占位头像：与招聘台卡片一致，有简历头像就显示，没有则显示按姓名生成的人像。
 * / The candidate's camera-off placeholder: the resume headshot when there is one, otherwise the
 * same name-seeded portrait the recruiting cards use.
 */
export function CandidatePlaceholderAvatar({
  image,
  name,
}: {
  image: string | null;
  name: string;
}) {
  const seed = name.trim() || "未命名候选人";
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[5] grid place-items-center"
      data-slot="candidate-placeholder-avatar"
    >
      <Avatar className="size-24 shadow-lg ring-1 ring-border" label={`${seed}的头像`} seed={seed}>
        {image ? <AvatarImage alt="" src={image} /> : null}
      </Avatar>
    </div>
  );
}

export function InterviewerPlaceholderAvatar({ image, name }: { image: string; name: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      data-slot="interviewer-placeholder-avatar"
      className={cn(
        "pointer-events-none absolute inset-0 z-[5] grid place-items-center transition-opacity duration-200",
        loaded ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="relative grid size-28 place-items-center">
        {/* oxlint-disable-next-line next/no-img-element -- TanStack Start has no Next image runtime; this decorative layer reuses the participant avatar URL. */}
        <img
          src={image}
          alt=""
          aria-hidden="true"
          className="absolute size-32 scale-125 rounded-full object-cover opacity-25 blur-2xl"
        />
        {/* oxlint-disable-next-line next/no-img-element -- Native image load/error events control when the participant placeholder becomes visible. */}
        <img
          src={image}
          alt={`${name}的头像`}
          className="relative size-24 rounded-full bg-muted object-cover shadow-lg"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
        />
      </div>
    </div>
  );
}
