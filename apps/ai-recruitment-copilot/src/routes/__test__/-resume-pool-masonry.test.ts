import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../w.$slug.studio.resume-pool.tsx", import.meta.url), "utf-8");

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

  it("uses sparse small-width breakpoints while keeping measured large screens", () => {
    expect(source).toContain('from "react-responsive-masonry"');
    expect(source).toContain("const RESUME_POOL_MASONRY_COLUMNS = {");
    expect(source).toContain("0: 1");
    expect(source).toContain("1024: 2");
    expect(source).toContain("1280: 3");
    expect(source).toContain("1536: 5");
    expect(source).toContain("1920: 6");
    expect(source).toContain("2560: 7");
    expect(source).toContain("columnsCountBreakPoints={RESUME_POOL_MASONRY_COLUMNS}");
  });

  it("stretches each card to the width of its masonry column", () => {
    expect(source).toContain('<Card className="w-full gap-3 rounded-md py-3">');
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

  it("keeps a bottom refresh action as an unframed breathing area", () => {
    expect(source).toContain("刷新简历广场");
    expect(source).toContain("已显示全部简历");
    expect(source).toContain(
      'className="flex flex-col items-center gap-3 px-2 pt-5 pb-10 text-center text-muted-foreground text-sm"',
    );
    expect(source).not.toContain("border-dashed bg-muted/20");
  });

  it("keeps import and record-management actions in one footer row", () => {
    expect(source).toContain('className="flex items-center gap-2 px-3"');
    expect(source).toContain('className="min-w-0 flex-1 justify-center"');
    expect(source).toContain("入库到简历库");
    expect(source).toContain("已入库");
    expect(source).not.toContain('<CardFooter className="flex-col items-stretch gap-2 px-3">');
  });

  it("prefixes parsed candidate names with the target role on resume pool cards", () => {
    expect(source).toContain("function getCandidateDisplayTitle");
    expect(source).toContain('record.resumeParseStatus !== "ready"');
    expect(source).toMatch(/return `\$\{targetRole\}-\$\{candidateTitle\}`;/u);
    expect(source).toContain("const title = getCandidateDisplayTitle(record);");
  });

  it("shows profile highlights on resume pool cards", () => {
    expect(source).toContain("毕业院校");
    expect(source).toContain("最近公司");
    expect(source).toContain("最近项目");
    expect(source).toContain("record.profileHighlights.schools");
    expect(source).toContain("record.profileHighlights.latestCompany");
    expect(source).toContain("record.profileHighlights.latestProject");
  });

  it("shows uploader organization and user on cards and detail summaries", () => {
    expect(source).toContain("function uploaderOrganizationLabel");
    expect(source).toContain("function uploaderUserLabel");
    expect(source).toContain("上传组织");
    expect(source).toContain("上传人");
    expect(source).toContain("record.uploaderOrganizationName");
    expect(source).toContain("record.uploaderName");
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
      source.indexOf("function ResumePoolCard"),
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

  it("separates profile highlights from source metadata with a divider", () => {
    expect(source).toContain(
      'className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 border-border/70 border-t pt-3 text-muted-foreground"',
    );
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

  it("places the pdf icon before the candidate name and email", () => {
    const cardSource = source.slice(
      source.indexOf("function ResumePoolCard"),
      source.indexOf("function ResumePoolPage"),
    );
    const pdfIndex = cardSource.indexOf("group/pdf");
    const titleIndex = cardSource.indexOf("点击姓名查看详情");
    const emailIndex = cardSource.indexOf("mailto:");

    expect(pdfIndex).toBeGreaterThanOrEqual(0);
    expect(titleIndex).toBeGreaterThanOrEqual(0);
    expect(emailIndex).toBeGreaterThanOrEqual(0);
    expect(pdfIndex).toBeLessThan(titleIndex);
    expect(titleIndex).toBeLessThan(emailIndex);
  });

  it("keeps the pdf icon hover free of background chrome", () => {
    const cardSource = source.slice(
      source.indexOf("function ResumePoolCard"),
      source.indexOf("function ResumePoolPage"),
    );

    expect(cardSource).toContain("group-hover/pdf:scale-105");
    expect(cardSource).not.toContain("hover:bg-muted");
  });
});
