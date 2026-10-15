import { AvatarImage } from "@/components/ui/avatar";
import { useOptionalWorkspaceSlug } from "@/lib/client/workspace-context";

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
