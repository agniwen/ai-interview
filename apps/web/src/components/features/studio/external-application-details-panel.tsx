import type { ExternalApplicationDetails } from "@app/shared/external-applications";
import { externalApplicationWorkModeLabels } from "@app/shared/external-applications";
import type { ReactNode } from "react";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";

function DetailField({
  children,
  fullWidth = false,
  label,
}: {
  children: ReactNode;
  fullWidth?: boolean;
  label: string;
}) {
  return (
    <div className={fullWidth ? "min-w-0 sm:col-span-2 lg:col-span-3" : "min-w-0"}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 min-w-0 wrap-break-word text-sm leading-6">{children}</dd>
    </div>
  );
}

export function ExternalApplicationDetailsPanel({
  details,
}: {
  details: ExternalApplicationDetails | null | undefined;
}) {
  if (!details) {
    return null;
  }
  const workModeLabel = externalApplicationWorkModeLabels[details.workMode];
  const trainingInstitution = details.trainingInstitution.trim();
  const className = details.className?.trim();
  const batch = details.batch?.trim();
  const alternateJobName = details.alternateJobName?.trim();
  const contactRaw = details.contactRaw?.trim();
  const portfolioContribution = details.portfolioContribution?.trim();

  return (
    <section aria-label="投递信息">
      <Frame className="min-w-0">
        <FrameHeader className="h-auto min-h-11 py-2">
          <FrameTitle>投递信息</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailField label="办公形式">{workModeLabel}</DetailField>
            {trainingInstitution ? (
              <DetailField label="培训机构/校区">{trainingInstitution}</DetailField>
            ) : null}
            {className ? <DetailField label="班级">{className}</DetailField> : null}
            {batch ? <DetailField label="批次">{batch}</DetailField> : null}
            {alternateJobName ? (
              <DetailField label="备选岗位">{alternateJobName}</DetailField>
            ) : null}
            {contactRaw ? <DetailField label="联系方式">{contactRaw}</DetailField> : null}
            {portfolioContribution ? (
              <DetailField fullWidth label="作品个人分工">
                <p className="whitespace-pre-wrap">{portfolioContribution}</p>
              </DetailField>
            ) : null}
          </dl>
        </FramePanel>
      </Frame>
    </section>
  );
}
