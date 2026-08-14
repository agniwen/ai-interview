/**
 * Desktop read-only candidate info (web overview section display path).
 * Edit / JD hover-card are intentionally omitted for the desktop client.
 */
import { describeResumeEvaluationStatus } from "@arc/shared/studio-resumes";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { DataField } from "@/components/features/display/data-field";
import { DataFields } from "@/components/features/display/data-fields";

export function ResumeOverviewCandidateInfoSection({
  detail,
}: {
  canEdit?: boolean;
  detail: ResumeLibraryDetail;
  onUpdated?: () => void;
  slug?: string;
}) {
  const resumeEvaluation = describeResumeEvaluationStatus(detail.resumeEvaluationStatus);
  const displayName = detail.candidateName || detail.resumeProfile?.name || null;
  const displayEmail = detail.candidateEmail ?? detail.resumeProfile?.email ?? null;
  const displayPhone = detail.candidatePhone ?? detail.resumeProfile?.phone ?? null;
  const jobName = detail.jobDescriptionName?.trim() || "暂未关联岗位";

  return (
    <section className="border-border/50 border-t pt-6">
      <div className="mb-3 flex items-center gap-1.5">
        <h3 className="font-medium text-sm">候选人信息</h3>
      </div>

      <DataFields columns={3} density="compact">
        <DataField label="姓名" value={displayName} />
        <DataField label="关联岗位" value={jobName} valueClassName="font-medium" />
        <DataField label="简历评估" value={resumeEvaluation.label} valueClassName="font-medium" />
        <DataField label="性别" value={detail.resumeProfile?.gender} />
        <DataField kind="number" label="年龄" value={detail.resumeProfile?.age} />
        <DataField kind="number" label="工作年限" value={detail.resumeProfile?.workYears} />
        <DataField kind="email" label="邮箱" value={displayEmail} />
        <DataField kind="phone" label="电话" value={displayPhone} />
      </DataFields>
    </section>
  );
}
