"use client";

import { IconDownload, IconLoader2 } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { useMemo, useState } from "react";
import { formatDate } from "@arc/shared/utils/time";
import { EmptyValue } from "@/components/features/display/empty-value";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DocxViewerPreview } from "@/components/ui/docx-viewer";
import { Modal } from "@/components/ui/modal";
import { PDFViewer } from "@/components/ui/pdf-viewer";
import { XlsxViewerPreview } from "@/components/ui/xlsx-viewer";
import { fetchResumePoolItem, fetchStudioResume } from "@/lib/client/api";
import type { DedupMatchRecord, DedupSourceCandidate } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { formatResumeCandidateTitle } from "./resume-record-display-id";
import { ImageResumePreviewContent } from "./resume-document-preview-dialog";
import { getResumeComparisonDocument } from "./resume-dedup-compare-model";
import type { ResumeComparisonSourceType } from "./resume-dedup-compare-model";

export type ResumeDedupCompareMode = "detail" | "resume";

interface ResumeComparisonDetail {
  candidateEmail: string | null;
  candidateName: string;
  candidatePhone: string | null;
  createdAt: string;
  id: string;
  jobDescriptionName: string | null;
  resumeFileName: string | null;
  resumeProfile: ResumeProfile | null;
  sourceLabel: string;
  sourceType: ResumeComparisonSourceType;
  statusLabel: string;
  targetRole: string | null;
  uploaderImage: string | null;
  uploaderName: string | null;
}

interface ResumeComparisonRef {
  candidateName: string;
  id: string;
  sourceType: ResumeComparisonSourceType;
}

function getComparisonSourceType(
  sourceType: DedupMatchRecord["sourceType"] | DedupSourceCandidate["sourceType"],
): ResumeComparisonSourceType {
  return sourceType === "resume_pool_item" ? "resume_pool_item" : "studio_interview";
}

async function fetchComparisonDetail(
  slug: string,
  candidate: ResumeComparisonRef,
): Promise<ResumeComparisonDetail | null> {
  if (candidate.sourceType === "resume_pool_item") {
    const detail = await fetchResumePoolItem(slug, candidate.id);
    return detail
      ? {
          candidateEmail: detail.candidateEmail,
          candidateName: detail.candidateName,
          candidatePhone: detail.candidatePhone,
          createdAt: detail.createdAt,
          id: detail.id,
          jobDescriptionName: detail.jobDescriptionName,
          resumeFileName: detail.resumeFileName,
          resumeProfile: detail.resumeProfile,
          sourceLabel: "人才库",
          sourceType: "resume_pool_item",
          statusLabel: detail.status === "active" ? "有效" : "已归档",
          targetRole: detail.targetRole,
          uploaderImage: detail.uploaderImage,
          uploaderName: detail.uploaderName,
        }
      : null;
  }

  const detail = await fetchStudioResume(slug, candidate.id);
  return detail
    ? {
        candidateEmail: detail.candidateEmail,
        candidateName: detail.candidateName,
        candidatePhone: detail.candidatePhone,
        createdAt: detail.createdAt,
        id: detail.id,
        jobDescriptionName: detail.jobDescriptionName,
        resumeFileName: detail.resumeFileName,
        resumeProfile: detail.resumeProfile,
        sourceLabel: "招聘台",
        sourceType: "studio_interview",
        statusLabel: detail.outcome === "in_pipeline" ? "流程中" : "已结案",
        targetRole: detail.targetRole,
        uploaderImage: detail.creatorImage,
        uploaderName: detail.creatorName,
      }
    : null;
}

function ComparisonMeta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 min-w-0 break-words text-sm">{value || <EmptyValue />}</dd>
    </div>
  );
}

function DetailComparisonContent({ detail }: { detail: ResumeComparisonDetail }) {
  return (
    <div className="space-y-6 p-5">
      <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
        <ComparisonMeta label="目标岗位" value={detail.targetRole} />
        <ComparisonMeta label="关联职位" value={detail.jobDescriptionName} />
        <ComparisonMeta label="邮箱" value={detail.candidateEmail} />
        <ComparisonMeta label="手机" value={detail.candidatePhone} />
        <ComparisonMeta label="来源" value={detail.sourceLabel} />
        <ComparisonMeta label="记录状态" value={detail.statusLabel} />
      </dl>
      <div className="border-border/70 border-t pt-5">
        <ResumeProfileView profile={detail.resumeProfile} />
      </div>
    </div>
  );
}

function ResumeComparisonContent({
  detail,
  slug,
}: {
  detail: ResumeComparisonDetail;
  slug: string;
}) {
  const [isDark, setIsDark] = useState(false);
  const document = getResumeComparisonDocument({
    fileName: detail.resumeFileName,
    id: detail.id,
    slug,
    sourceType: detail.sourceType,
  });
  const documentOptions = useMemo(
    () => ({
      cMapPacked: true,
      cMapUrl: "https://unpkg.com/pdfjs-dist@5.4.296/cmaps/",
      standardFontDataUrl: "https://unpkg.com/pdfjs-dist@5.4.296/standard_fonts/",
    }),
    [],
  );

  if (!document) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-medium text-sm">该简历暂不支持在线预览</p>
        <p className="text-muted-foreground text-xs">可返回详情查看解析后的履历信息。</p>
      </div>
    );
  }

  if (document.kind === "pdf") {
    return (
      <PDFViewer
        className="h-full"
        defaultZoom={0.9}
        documentOptions={documentOptions}
        downloadFileName={detail.resumeFileName ?? "resume.pdf"}
        file={document.previewUrl}
        showDownload={false}
        showUpload={false}
      />
    );
  }

  if (document.kind === "docx") {
    return (
      <DocxViewerPreview
        className="h-full"
        defaultZoom={0.85}
        fileName={detail.resumeFileName ?? undefined}
        isDark={isDark}
        onIsDarkChange={setIsDark}
        showDownload={false}
        showUpload={false}
        src={document.previewUrl}
      />
    );
  }

  if (document.kind === "xlsx") {
    return (
      <XlsxViewerPreview
        className="h-full"
        fileName={detail.resumeFileName ?? undefined}
        isDark={isDark}
        onIsDarkChange={setIsDark}
        showDownload={false}
        showUpload={false}
        src={document.previewUrl}
      />
    );
  }

  return (
    <ImageResumePreviewContent
      filename={detail.resumeFileName ?? undefined}
      url={document.previewUrl}
    />
  );
}

function ComparisonColumn({
  candidate,
  detail,
  isError,
  isLoading,
  label,
  mode,
  slug,
}: {
  candidate: ResumeComparisonRef;
  detail: ResumeComparisonDetail | null | undefined;
  isError: boolean;
  isLoading: boolean;
  label: string;
  mode: ResumeDedupCompareMode;
  slug: string;
}) {
  const document = detail
    ? getResumeComparisonDocument({
        fileName: detail.resumeFileName,
        id: detail.id,
        slug,
        sourceType: detail.sourceType,
      })
    : null;

  let content: React.ReactNode;
  if (isLoading) {
    content = (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground text-sm">
        <IconLoader2 className="size-4 animate-spin" />
        正在加载
      </div>
    );
  } else if (isError) {
    content = (
      <div className="flex h-full items-center justify-center text-destructive text-sm">
        简历加载失败
      </div>
    );
  } else if (!detail) {
    content = (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        未找到该简历
      </div>
    );
  } else if (mode === "detail") {
    content = <DetailComparisonContent detail={detail} />;
  } else {
    content = <ResumeComparisonContent detail={detail} slug={slug} />;
  }

  return (
    <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)]">
      <header className="flex min-w-0 items-center justify-between gap-3 border-border/70 border-b bg-background px-5 py-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">{label}</p>
          <h3 className="truncate font-medium text-sm">
            {formatResumeCandidateTitle(
              detail?.candidateName ?? candidate.candidateName,
              candidate.id,
            )}
          </h3>
          {detail ? (
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <Avatar className="size-5">
                  {detail.uploaderImage ? (
                    <AvatarImage alt={detail.uploaderName ?? "上传人"} src={detail.uploaderImage} />
                  ) : null}
                  <AvatarFallback className="text-[9px]">
                    {detail.uploaderName?.trim().charAt(0).toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">上传人：{detail.uploaderName || "—"}</span>
              </span>
              <span className="shrink-0">上传时间：{formatDate(detail.createdAt)}</span>
            </div>
          ) : null}
        </div>
        {mode === "resume" && document ? (
          <Button
            className="shrink-0"
            nativeButton={false}
            render={
              <a download={detail?.resumeFileName ?? undefined} href={document.downloadUrl}>
                <IconDownload className="size-3.5" />
                下载
              </a>
            }
            size="sm"
            variant="outline"
          />
        ) : null}
      </header>
      <div className="min-h-0 overflow-auto bg-muted/20">{content}</div>
    </section>
  );
}

export function ResumeDedupCompareDialog({
  match,
  mode,
  onOpenChange,
  open,
  source,
}: {
  match: DedupMatchRecord;
  mode: ResumeDedupCompareMode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  source: DedupSourceCandidate;
}) {
  const slug = useWorkspaceSlug();
  const sourceRef: ResumeComparisonRef = {
    candidateName: source.candidateName,
    id: source.id,
    sourceType: getComparisonSourceType(source.sourceType),
  };
  const matchRef: ResumeComparisonRef = {
    candidateName: match.candidateName,
    id: match.id,
    sourceType: getComparisonSourceType(match.sourceType),
  };
  const sourceQuery = useQuery({
    enabled: open,
    queryFn: () => fetchComparisonDetail(slug, sourceRef),
    queryKey: ["resume-dedup-compare", slug, sourceRef.sourceType, sourceRef.id],
  });
  const matchQuery = useQuery({
    enabled: open,
    queryFn: () => fetchComparisonDetail(slug, matchRef),
    queryKey: ["resume-dedup-compare", slug, matchRef.sourceType, matchRef.id],
  });

  return (
    <Modal
      bodyClassName="min-h-0 overflow-hidden p-0"
      className="h-[92dvh]"
      description="左侧为当前简历，右侧为疑似简历。"
      onOpenChange={onOpenChange}
      open={open}
      size="full"
      title={mode === "detail" ? "简历详情对比" : "原始简历对比"}
    >
      <div className="grid h-full min-h-0 grid-cols-2 divide-x divide-border">
        <ComparisonColumn
          candidate={sourceRef}
          detail={sourceQuery.data}
          isError={sourceQuery.isError}
          isLoading={sourceQuery.isLoading}
          label="当前简历"
          mode={mode}
          slug={slug}
        />
        <ComparisonColumn
          candidate={matchRef}
          detail={matchQuery.data}
          isError={matchQuery.isError}
          isLoading={matchQuery.isLoading}
          label="疑似简历"
          mode={mode}
          slug={slug}
        />
      </div>
    </Modal>
  );
}
