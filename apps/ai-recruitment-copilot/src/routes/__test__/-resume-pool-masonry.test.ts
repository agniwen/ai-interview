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

  it("keeps a bottom refresh action as an unframed breathing area", () => {
    expect(source).toContain("刷新简历广场");
    expect(source).toContain("已显示全部简历");
    expect(source).toContain(
      'className="flex flex-col items-center gap-3 px-2 pt-5 pb-10 text-center text-muted-foreground text-sm"',
    );
    expect(source).not.toContain("border-dashed bg-muted/20");
  });

  it("renders the import action as a full-width text button", () => {
    expect(source).toContain('className="w-full justify-center"');
    expect(source).toContain("入库到简历库");
    expect(source).toContain("已入库");
  });

  it("shows profile highlights on resume pool cards", () => {
    expect(source).toContain("毕业院校");
    expect(source).toContain("最近公司");
    expect(source).toContain("最近项目");
    expect(source).toContain("record.profileHighlights.schools");
    expect(source).toContain("record.profileHighlights.latestCompany");
    expect(source).toContain("record.profileHighlights.latestProject");
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
});
