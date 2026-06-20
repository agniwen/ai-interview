import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../w.$slug.studio.resume-pool.tsx", import.meta.url), "utf-8");
const educationLineSource = readFileSync(
  new URL("../../components/features/resume/resume-education-line.tsx", import.meta.url),
  "utf-8",
);

describe("ResumePoolPage masonry layout", () => {
  it("defaults to the public resume pool tab", () => {
    expect(source).toContain('return value === "private" ? "private" : "public";');
  });

  it("shows the public pool tab before private resumes", () => {
    const publicTabIndex = source.indexOf('value="public"');
    const privateTabIndex = source.indexOf('value="private"');

    expect(publicTabIndex).toBeGreaterThanOrEqual(0);
    expect(privateTabIndex).toBeGreaterThanOrEqual(0);
    expect(publicTabIndex).toBeLessThan(privateTabIndex);
  });

  it("uses sparse small-width breakpoints while skipping a five-column layout", () => {
    expect(source).toContain('from "react-responsive-masonry"');
    expect(source).toContain("const RESUME_POOL_MASONRY_COLUMNS = {");
    expect(source).toContain("0: 1");
    expect(source).toContain("1024: 2");
    expect(source).toContain("1280: 3");
    expect(source).toContain("1440: 4");
    expect(source).not.toContain("1536: 5");
    expect(source).toContain("1920: 6");
    expect(source).toContain("2560: 7");
    expect(source).toContain("columnsCountBreakPoints={RESUME_POOL_MASONRY_COLUMNS}");
  });

  it("stretches each card to the width of its masonry column", () => {
    expect(source).toContain('<Card className="w-full gap-3 rounded-md py-3">');
  });

  it("vertically centers the resume file icon with the card title", () => {
    const cardSource = source.slice(
      source.indexOf("function ResumePoolCard({"),
      source.indexOf("function ResumePoolLoadingState"),
    );

    expect(cardSource).toContain('<CardHeader className="flex flex-row items-center gap-2 px-3">');
    expect(cardSource).not.toContain("items-start gap-2 px-3");
  });

  it("uses infinite scroll instead of the pagination bar", () => {
    expect(source).not.toContain("PaginationBar");
    expect(source).toContain("loadMoreRef");
    expect(source).toContain("IntersectionObserver");
    expect(source).toContain("hasMoreRecords");
  });

  it("keeps the empty upload prompt hidden while the pool is initially loading", () => {
    expect(source).toContain("const isInitialPoolLoading =");
    expect(source).toContain("const showEmptyState =");
    expect(source).toContain("const showPoolFooter =");
    expect(source).toContain("正在加载简历");
    expect(source).toContain("if (showEmptyState) {");
    expect(source).toContain("showPoolFooter ? (");
  });

  it("dims the masonry cards to 60 percent opacity while resume pool data is loading", () => {
    const listSource = source.slice(
      source.indexOf("function ResumePoolListContent"),
      source.indexOf("function ResumePoolToolbarActions"),
    );
    const pageSource = source.slice(
      source.indexOf("function ResumePoolPage"),
      source.indexOf("export const Route"),
    );

    expect(listSource).toContain("isPoolBusy");
    expect(listSource).toContain("opacity-60");
    expect(listSource).toContain("transition-opacity");
    expect(pageSource).toContain("isPoolBusy={isPoolBusy}");
  });

  it("keeps a bottom refresh action as an unframed breathing area", () => {
    expect(source).toContain("刷新简历广场");
    expect(source).toContain("已显示全部简历");
    expect(source).toContain(
      'className="flex flex-col items-center gap-3 px-2 pt-5 pb-10 text-center text-muted-foreground text-sm"',
    );
    expect(source).not.toContain("border-dashed bg-muted/20");
  });

  it("keeps import and record-management actions in one footer row", () => {
    const cardSource = source.slice(
      source.indexOf("function ResumePoolCard({"),
      source.indexOf("function ResumePoolLoadingState"),
    );

    expect(source).toContain('className="flex items-center gap-2 px-3"');
    expect(source).toContain('className="min-w-0 flex-1 justify-center"');
    expect(source).toContain("入库到简历库");
    expect(source).toContain("已入库");
    expect(source).toContain("function getResumePoolImportActionState");
    expect(source).toContain('case "queued"');
    expect(source).toContain('label: "排队中"');
    expect(source).toContain('case "processing"');
    expect(source).toContain('label: "解析中"');
    expect(source).toContain('case "failed"');
    expect(source).toContain('label: "解析失败"');
    expect(source).toContain('case "unparsed"');
    expect(source).toContain('label: "未解析"');
    expect(cardSource).toContain(
      "const importActionState = getResumePoolImportActionState(record);",
    );
    expect(cardSource).toContain("disabled={importActionState.disabled}");
    expect(cardSource).toContain("{importActionState.label}");
    expect(cardSource).not.toContain("resumeParseStatusBadge(record)");
    expect(cardSource).not.toContain('<Badge variant="secondary">未入库</Badge>');
    expect(source).not.toContain('<CardFooter className="flex-col items-stretch gap-2 px-3">');
  });

  it("prefixes parsed candidate names with the target role on resume pool cards", () => {
    expect(source).toContain("function getCandidateDisplayTitle");
    expect(source).toContain("function formatCandidateWorkYears");
    expect(source).toContain("record.workYears");
    expect(source).toContain('record.resumeParseStatus !== "ready"');
    expect(source).toMatch(/return `\$\{targetRole\}-\$\{workYears\}-\$\{candidateTitle\}`;/u);
    expect(source).toMatch(/return `\$\{targetRole\}-\$\{candidateTitle\}`;/u);
    expect(source).toContain("const title = getCandidateDisplayTitle(record);");
  });

  it("shows profile highlights on resume pool cards", () => {
    const cardSource = source.slice(
      source.indexOf("function ResumePoolCard({"),
      source.indexOf("function ResumePoolLoadingState"),
    );

    expect(source).toContain("教育经历");
    expect(source).toContain("最近公司");
    expect(source).toContain("最近项目");
    expect(source).toContain("ResumeEducationDisplayLine");
    expect(source).toContain("const { educationItems } = profileHighlights;");
    expect(educationLineSource).toContain("function EducationLevelTag");
    expect(educationLineSource).toContain("bg-green-500/10");
    expect(educationLineSource).toContain("bg-blue-500/10");
    expect(educationLineSource).toContain("bg-purple-500/10");
    expect(source).toContain("profileHighlights.educationLines");
    expect(source).toContain("profileHighlights.schools");
    expect(source).toContain("profileHighlights.latestCompany");
    expect(source).toContain("profileHighlights.latestProject");
    expect(source).toContain('educationFallbackLines.join("\\n")');
    expect(cardSource).toContain("ResumePoolCardHighlights");
    expect(cardSource).not.toContain("truncate text-foreground");
  });

  it("shows mastered skills on resume pool cards instead of normalized search skills", () => {
    const cardSource = source.slice(
      source.indexOf("function ResumePoolCard({"),
      source.indexOf("function ResumePoolLoadingState"),
    );

    expect(cardSource).toContain("record.masteredSkills");
    expect(cardSource).not.toContain("record.masteredSkills.slice(0, 5)");
    expect(cardSource).not.toContain("record.skillsNormalized.slice(0, 5)");
  });

  it("keeps source and creation metadata in details while showing uploader metadata on cards", () => {
    const cardSource = source.slice(
      source.indexOf("function ResumePoolCard({"),
      source.indexOf("function ResumePoolLoadingState"),
    );
    const detailSource = source.slice(
      source.indexOf("function ResumePoolDetailSummaryPanel"),
      source.indexOf("function ResumePoolStructuredInfoPanel"),
    );

    expect(source).toContain("function uploaderOrganizationLabel");
    expect(source).toContain("function uploaderUserLabel");
    expect(source).toContain("record.uploaderOrganizationName");
    expect(source).toContain("record.uploaderName");
    expect(detailSource).toContain('label="来源"');
    expect(detailSource).toContain('label="上传组织"');
    expect(detailSource).toContain('label="上传人"');
    expect(detailSource).toContain('label="创建时间"');
    expect(cardSource).not.toContain("sourceLabel(record)");
    expect(cardSource).not.toContain("record.createdAt");
    expect(cardSource).toContain("ResumePoolCardUploaderMeta");
    expect(cardSource.indexOf('record.targetRole || "未填写目标岗位"')).toBeLessThan(
      cardSource.indexOf("ResumePoolCardUploaderMeta"),
    );
    expect(source).toContain("uploaderOrganizationLabel(record)");
    expect(source).toContain("record.uploaderImage");
    expect(source).toContain("MemberCell");
  });

  it("hides candidate contact information on resume pool cards", () => {
    const cardSource = source.slice(
      source.indexOf("function ResumePoolCard({"),
      source.indexOf("function ResumePoolLoadingState"),
    );

    expect(cardSource).not.toContain("record.candidateEmail");
    expect(cardSource).not.toContain("record.candidatePhone");
    expect(cardSource).not.toContain("mailto:");
    expect(cardSource).not.toContain("PhoneIcon");
  });

  it("keeps uploader organization and uploader on the same card row", () => {
    const uploaderMetaSource = source.slice(
      source.indexOf("function ResumePoolCardUploaderMeta"),
      source.indexOf("function ResumePoolDetailDialog"),
    );

    expect(uploaderMetaSource).toContain('className="flex min-w-0 items-center gap-1.5');
    expect(uploaderMetaSource).toContain('avatarClassName="size-4"');
    expect(uploaderMetaSource).toContain('avatarSize="default"');
    expect(uploaderMetaSource).toContain('className="min-w-0 gap-1"');
    expect(uploaderMetaSource).not.toContain('className="flex flex-col gap-1.5"');
    expect(uploaderMetaSource).not.toContain('avatarSize="sm"');
    expect(uploaderMetaSource).not.toContain("flex-1 items-center");
    expect(uploaderMetaSource).not.toContain("min-w-0 flex-1 gap-1.5");
    expect(uploaderMetaSource.indexOf("uploaderOrganizationLabel(record)")).toBeLessThan(
      uploaderMetaSource.indexOf("<MemberCell"),
    );
  });

  it("shows delete on public cards only when the current user uploaded the record", () => {
    expect(source).toContain("function canDeletePoolRecord");
    expect(source).toContain("record.organizationId === currentOrganizationId");
    expect(source).toContain("record.createdBy === currentUserId");
    expect(source).toContain("const canDelete = canDeletePoolRecord(");
    expect(source).toContain("canDelete={canDelete}");
  });

  it("keeps public delete, private publish, and private delete as icon-only card actions", () => {
    const cardSource = source.slice(
      source.indexOf("function ResumePoolCard({"),
      source.indexOf("function ResumePoolLoadingState"),
    );

    expect(cardSource).toContain("canDelete ? (");
    expect(cardSource).toContain('aria-label={scope === "private" ? "删除私有简历" : "删除简历"}');
    expect(cardSource).toContain('aria-label="推送到简历广场"');
    expect(cardSource).toContain('"删除私有简历"');
    expect(cardSource).toContain('"删除简历"');
    expect(cardSource).toContain('size="icon-sm"');
    expect(cardSource).not.toContain('className="flex justify-end gap-1"');
  });

  it("adds selectable private cards with a bulk delete action beside upload", () => {
    const cardSource = source.slice(
      source.indexOf("function ResumePoolCard({"),
      source.indexOf("function ResumePoolLoadingState"),
    );
    const pageSource = source.slice(
      source.indexOf("function ResumePoolPage"),
      source.indexOf("export const Route"),
    );
    const titleInterpolation = ["$", "{title}"].join("");

    expect(source).toContain('import { Checkbox } from "@/components/ui/checkbox";');
    expect(cardSource).toContain(`aria-label={\`选择 ${titleInterpolation}\`}`);
    expect(cardSource).toContain(
      "onCheckedChange={(checked) => onSelectionChange(record, checked === true)}",
    );
    expect(pageSource).toContain("selectedPrivateResumeIds");
    expect(pageSource).toContain("hasSelectedPrivateResumes");
    expect(pageSource).toContain("selectedPrivateResumeIdsArray");
    expect(source).toContain("删除所选");
    expect(pageSource).toContain("bulkDeleteMutation.isPending");
  });

  it("keeps bulk delete outside the upload button group", () => {
    const toolbarSource = source.slice(
      source.indexOf("function ResumePoolToolbarActions"),
      source.indexOf("function ResumePoolPage"),
    );
    const buttonGroupEndIndex = toolbarSource.indexOf("</ButtonGroup>");
    const deleteButtonIndex = toolbarSource.indexOf("删除所选");

    expect(toolbarSource).toContain('className="flex items-center gap-2"');
    expect(buttonGroupEndIndex).toBeGreaterThanOrEqual(0);
    expect(deleteButtonIndex).toBeGreaterThan(buttonGroupEndIndex);
  });

  it("bulk deletes selected private resumes and refreshes the list afterwards", () => {
    const pageSource = source.slice(
      source.indexOf("function ResumePoolPage"),
      source.indexOf("export const Route"),
    );

    expect(pageSource).toContain("const bulkDeleteMutation = useMutation({");
    expect(pageSource).toContain("Promise.all(ids.map((id) => deleteResumePoolItem(slug, id)))");
    expect(pageSource).toContain("setSelectedPrivateResumeIds(new Set())");
    expect(pageSource).toContain("onSettled: invalidatePool");
    expect(pageSource).toContain("grid.bind.data.map((record) => record.id)");
  });

  it("asks for a dedup policy only when uploading private resume pool items", () => {
    const pageSource = source.slice(
      source.indexOf("function ResumePoolPage"),
      source.indexOf("export const Route"),
    );
    const policyDialogSource = source.slice(
      source.indexOf("function PrivateResumePoolUploadPolicyDialog"),
      source.indexOf("function ImportResumePoolDialog"),
    );

    expect(pageSource).toContain("pendingPrivateUploadFiles");
    expect(pageSource).toContain("privateUploadPolicyOpen");
    expect(pageSource).toContain('if (targetScope === "private") {');
    expect(pageSource).toContain("setPendingPrivateUploadFiles(files)");
    expect(pageSource).toContain("setPrivateUploadPolicyOpen(true)");
    expect(pageSource).toContain('startQueuedUpload(files, "public", "create")');
    expect(policyDialogSource).toContain('useState<ResumeUploadBatchDedupPolicy>("skip")');
    expect(policyDialogSource).toContain("跳过疑似重复");
    expect(policyDialogSource).toContain("照样创建");
    expect(source).toContain("<PrivateResumePoolUploadPolicyDialog");
  });

  it("shows profile highlight labels above full content", () => {
    const highlightSource = source.slice(
      source.indexOf("function ResumePoolHighlightRow"),
      source.indexOf("function ResumePoolCardHighlights"),
    );

    expect(highlightSource).toContain(
      'className="flex items-center gap-1.5 text-muted-foreground"',
    );
    expect(highlightSource).toContain('className="mt-1 whitespace-pre-wrap break-words');
    expect(highlightSource).not.toContain("truncate");
  });

  it("separates candidate detail and pdf preview interactions", () => {
    expect(source).toContain("ResumePoolDetailDialog");
    expect(source).toContain("detailRecord");
    expect(source).toContain("onOpenDetail");
    expect(source).toContain("onOpenPdf");
    expect(source).toContain("点击姓名查看详情");
  });

  it("loads full resume pool detail for the candidate detail dialog", () => {
    expect(source).toContain("fetchResumePoolItem(slug, itemId)");
    expect(source).toContain('queryKey: ["resume-pool", "detail", slug, itemId]');
    expect(source).toContain("<ResumeProfileView profile={resumeProfile} />");
  });

  it("renders resume-library overview sections in the candidate detail dialog", () => {
    expect(source).toContain("候选人摘要");
    expect(source).toContain("结构化信息");
    expect(source).toContain("工作年限");
  });

  it("uses an airy profile layout for the resume pool detail dialog", () => {
    const summaryItemSource = source.slice(
      source.indexOf("function DetailSummaryItem"),
      source.indexOf("type ResumePoolDetailLike"),
    );
    const summaryPanelSource = source.slice(
      source.indexOf("function ResumePoolDetailSummaryPanel"),
      source.indexOf("function ResumePoolStructuredInfoPanel"),
    );
    const structuredPanelSource = source.slice(
      source.indexOf("function ResumePoolStructuredInfoPanel"),
      source.indexOf("function ResumePoolHighlightRow"),
    );
    const detailDialogSource = source.slice(
      source.indexOf("function ResumePoolDetailDialog"),
      source.indexOf("function ResumePoolCard({"),
    );

    expect(summaryItemSource).toContain("<dt");
    expect(summaryItemSource).toContain("<dd");
    expect(summaryItemSource).not.toContain("rounded-xl border");
    expect(summaryPanelSource).toContain("bg-muted/20");
    expect(summaryPanelSource).not.toContain("rounded-2xl border border-border bg-background p-5");
    expect(structuredPanelSource).toContain("border-t border-border/50 pt-6");
    expect(structuredPanelSource).not.toContain(
      "rounded-2xl border border-border bg-background p-5",
    );
    expect(detailDialogSource).toContain('className="space-y-8"');
  });

  it("places uploader metadata under the target role instead of the card title", () => {
    const cardSource = source.slice(
      source.indexOf("function ResumePoolCard({"),
      source.indexOf("function ResumePoolPage"),
    );
    const headerSource = cardSource.slice(
      cardSource.indexOf("<CardHeader"),
      cardSource.indexOf("</CardHeader>"),
    );
    const pdfIndex = cardSource.indexOf("group/pdf");
    const titleIndex = cardSource.indexOf("点击姓名查看详情");
    const targetRoleIndex = cardSource.indexOf('record.targetRole || "未填写目标岗位"');
    const uploaderIndex = cardSource.indexOf("ResumePoolCardUploaderMeta");

    expect(pdfIndex).toBeGreaterThanOrEqual(0);
    expect(titleIndex).toBeGreaterThanOrEqual(0);
    expect(targetRoleIndex).toBeGreaterThanOrEqual(0);
    expect(uploaderIndex).toBeGreaterThanOrEqual(0);
    expect(pdfIndex).toBeLessThan(titleIndex);
    expect(titleIndex).toBeLessThan(targetRoleIndex);
    expect(targetRoleIndex).toBeLessThan(uploaderIndex);
    expect(headerSource).not.toContain("ResumePoolCardUploaderMeta");
    expect(source).toContain('avatarClassName="size-4"');
  });

  it("keeps the pdf icon hover free of background chrome", () => {
    const cardSource = source.slice(
      source.indexOf("function ResumePoolCard({"),
      source.indexOf("function ResumePoolPage"),
    );

    expect(cardSource).toContain("group-hover/pdf:scale-105");
    expect(cardSource).not.toContain("hover:bg-muted");
  });

  it("shows a tooltip on unsupported resume preview file icons", () => {
    const cardSource = source.slice(
      source.indexOf("function ResumePoolCard({"),
      source.indexOf("function ResumePoolPage"),
    );

    expect(cardSource).toContain("UnsupportedResumeDocumentPreviewTooltip");
  });
});
