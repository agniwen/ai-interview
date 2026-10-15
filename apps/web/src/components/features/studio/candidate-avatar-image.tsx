import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { useOptionalWorkspaceSlug } from "@/lib/client/workspace-context";
import { cn } from "@app/shared/utils";

export type CandidateAvatarSource = "resume-pool" | "resumes";

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
  const src = `/api/w/${encodeURIComponent(slug)}/studio/${source}/${encodeURIComponent(recordId)}/avatar?v=${encodeURIComponent(version)}`;
  // The Avatar root already exposes the candidate's accessible name.
  return <AvatarImage alt="" src={src} />;
}

// 淘汰状态只淡化生成头像；候选人真实照片保持原色。
// A rejected record only mutes the generated avatar; a real headshot keeps its colours.
const MUTED_GENERATED_AVATAR_CLASS =
  "[&_[data-slot=avatar-generated]]:opacity-70 [&_[data-slot=avatar-generated]]:contrast-75 [&_[data-slot=avatar-generated]]:grayscale";

// 招聘台与人才库记录的候选人头像：带描边，优先显示简历头像，否则显示按姓名生成的头像。
// Candidate avatar for recruiting and talent-pool records: outlined, showing the resume headshot
// when there is one and the name-seeded generated avatar otherwise.
export function CandidateAvatar({
  className,
  generatedSize,
  label,
  muted = false,
  recordId,
  seed,
  source,
  version,
}: {
  className?: string;
  generatedSize: number;
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
      generatedSize={generatedSize}
      label={`${label}的头像`}
      seed={seed}
    >
      <CandidateAvatarImage recordId={recordId} source={source} version={version} />
    </Avatar>
  );
}
