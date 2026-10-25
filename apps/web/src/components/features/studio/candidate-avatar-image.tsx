import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { useOptionalWorkspaceSlug } from "@/lib/client/workspace-context";
import { cn } from "@app/shared/utils";

export type CandidateAvatarSource = "resume-pool" | "resumes";

/** 简历首页候选人头像的地址。URL of the candidate headshot cut from the resume's first page. */
export function getCandidateAvatarUrl(
  slug: string,
  source: CandidateAvatarSource,
  recordId: string,
  version: string,
) {
  return `/api/w/${encodeURIComponent(slug)}/studio/${source}/${encodeURIComponent(recordId)}/avatar?v=${encodeURIComponent(version)}`;
}

/**
 * 详情里的候选人头像来源：优先简历记录，其次 AI 初面轮次详情；都没有头像时返回 null。
 * Headshot source in the detail views: the resume record first, then the AI interview round.
 */
export function resolveCandidateAvatarSource({
  resumeRecord,
  round,
}: {
  resumeRecord?: { id: string; candidateAvatarVersion: string | null } | null;
  round?: { candidate: { id: string }; candidateAvatarVersion: string | null } | null;
}): { recordId: string; version: string } | null {
  if (resumeRecord?.candidateAvatarVersion) {
    return { recordId: resumeRecord.id, version: resumeRecord.candidateAvatarVersion };
  }
  if (round?.candidateAvatarVersion) {
    return { recordId: round.candidate.id, version: round.candidateAvatarVersion };
  }
  return null;
}

// 简历首页识别出的候选人头像；没有头像或加载失败时保留外层 Avatar 原有的生成头像。
// Candidate headshot from the resume's first page; the surrounding generated avatar stays
// visible when there is no headshot or the image fails to load.
export function CandidateAvatarImage({
  recordId,
  source,
  version,
}: {
  recordId: string;
  source: CandidateAvatarSource;
  version: string | null;
}) {
  const slug = useOptionalWorkspaceSlug();
  if (!(slug && version)) {
    return null;
  }
  // The Avatar root already exposes the candidate's accessible name.
  return <AvatarImage alt="" src={getCandidateAvatarUrl(slug, source, recordId, version)} />;
}

// 淘汰状态只淡化生成头像；候选人真实照片保持原色。
// A rejected record only mutes the generated avatar; a real headshot keeps its colours.
const MUTED_GENERATED_AVATAR_CLASS =
  "[&_[data-slot=avatar-generated]]:opacity-70 [&_[data-slot=avatar-generated]]:contrast-75 [&_[data-slot=avatar-generated]]:grayscale";

// 招聘台与人才库记录的候选人头像：带描边，优先显示简历头像，否则显示按姓名选发型的灰度人像。
// Candidate avatar for recruiting and talent-pool records: outlined, showing the resume headshot
// when there is one and a name-seeded greyscale portrait otherwise.
export function CandidateAvatar({
  className,
  label,
  muted = false,
  recordId,
  seed,
  source,
  version,
}: {
  className?: string;
  label: string;
  muted?: boolean;
  recordId: string;
  seed: string;
  source: CandidateAvatarSource;
  version: string | null;
}) {
  return (
    <Avatar
      className={cn(
        "shrink-0 ring-1 ring-border",
        muted && MUTED_GENERATED_AVATAR_CLASS,
        className,
      )}
      label={`${label}的头像`}
      seed={seed}
    >
      <CandidateAvatarImage recordId={recordId} source={source} version={version} />
    </Avatar>
  );
}
