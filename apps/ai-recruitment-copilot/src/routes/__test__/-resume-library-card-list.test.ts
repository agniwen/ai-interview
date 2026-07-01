import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../w.$slug.studio.resumes.tsx", import.meta.url), "utf-8");

describe("ResumeLibraryPage card list", () => {
  it("keeps the previous table in a comment and renders the card list instead", () => {
    const tableStart = source.indexOf("{/* DataGrid table preserved");
    const tableEnd = source.indexOf("*/}", tableStart);
    const activeRenderSource = source.slice(source.indexOf("<ResumeLibraryCardList"), tableStart);

    expect(tableStart).toBeGreaterThan(0);
    expect(tableEnd).toBeGreaterThan(tableStart);
    expect(source.slice(tableStart, tableEnd)).toContain("<DataGrid<ResumeLibraryListRecord>");
    expect(activeRenderSource).toContain("<ResumeLibraryCardList");
    expect(activeRenderSource).not.toContain("<DataGrid<ResumeLibraryListRecord>");
  });

  it("lays out resume cards with candidate, lifecycle, job, contact, review and action areas", () => {
    const actionSource = source.slice(
      source.indexOf("function ResumeLibraryCardActions("),
      source.indexOf("function ResumeLibraryCard("),
    );
    const actionButtonSource = source.slice(
      source.indexOf("function ResumeLibraryIconActionButton("),
      source.indexOf("function ResumeLibraryCardActions("),
    );
    const cardSource = source.slice(
      source.indexOf("function ResumeLibraryCard("),
      source.indexOf("function ResumeLibraryCardList("),
    );
    const avatarInteropSource = source.slice(
      source.indexOf('import AvvvatarsModule from "avvvatars-react";'),
      source.indexOf("// 工具栏多选下拉"),
    );
    const skillsSource = source.slice(
      source.indexOf("function getResumeCardSkills("),
      source.indexOf("function getResumeCardSummary("),
    );
    const creatorMetaSource = source.slice(
      source.indexOf("function ResumeCardCreatorMeta("),
      source.indexOf("interface ResumeLibraryCardProps"),
    );
    const profileSnapshotSource = source.slice(
      source.indexOf("function getLatestWorkLine("),
      source.indexOf("function getResumeCardSummary("),
    );

    expect(cardSource).toContain("duplicateMatchBadge(record");
    expect(cardSource).toContain("ResumeLifecycleBadge");
    expect(cardSource).toContain("getResumeLibraryJobDescriptionLabel(record)");
    expect(cardSource).toContain("<Avvvatars");
    expect(avatarInteropSource).toContain('import AvvvatarsModule from "avvvatars-react";');
    expect(avatarInteropSource).toContain('typeof AvvvatarsModule === "function"');
    expect(avatarInteropSource).toContain(".default");
    expect(cardSource).toContain('style="shape"');
    expect(cardSource).toContain("getResumeAvatarValue(record)");
    expect(cardSource).toContain("record.candidateEmail");
    expect(cardSource).toContain("record.candidatePhone");
    expect(cardSource).toContain('formatResumeCardContact(record.candidateEmail, "未填写邮箱")');
    expect(cardSource).toContain('formatResumeCardContact(record.candidatePhone, "未填写电话")');
    expect(cardSource).toContain("关联岗位");
    expect(cardSource).toContain("jobDescriptionLabel");
    expect(cardSource).not.toContain("record.targetRole");
    expect(cardSource).toContain("ResumeCardMetaSeparator");
    expect(cardSource).toContain("ResumeCardCreatorMeta");
    expect(cardSource).toContain("record.creatorImage");
    expect(creatorMetaSource).toContain("<Avatar");
    expect(creatorMetaSource).toContain("<AvatarImage");
    expect(creatorMetaSource).toContain("<AvatarFallback");
    expect(cardSource).toContain("value={record.createdAt}");
    expect(cardSource).not.toContain("rounded-xl bg-muted/25 p-3 text-xs");
    expect(cardSource).toContain("getResumeCardSkills(record)");
    expect(cardSource).toContain("ResumeCardProfileSnapshot");
    expect(cardSource).toContain("profileSnapshot");
    expect(profileSnapshotSource).toContain("record.resumeProfile?.workExperiences");
    expect(profileSnapshotSource).toContain("formatResumeCardPeriod");
    expect(profileSnapshotSource).toContain("work.period");
    expect(profileSnapshotSource).toContain("record.resumeProfile?.educationExperiences");
    expect(profileSnapshotSource).toContain("education.period");
    expect(profileSnapshotSource).toContain("education.graduationYear");
    expect(profileSnapshotSource).toContain("record.resumeProfile?.schools");
    expect(source).toContain("ml-22");
    expect(source).toContain("xl:ml-0");
    expect(source).toContain("content-start");
    expect(source).toContain("xl:self-start");
    expect(source).toContain("xl:pt-8.5");
    expect(source).not.toContain("content-center");
    expect(source).not.toContain("xl:self-center");
    expect(source).toContain("text-[11px]");
    expect(source).toContain("text-foreground text-sm");
    expect(skillsSource).toContain("record.resumeProfile?.skills");
    expect(skillsSource).not.toContain("resumeReview?.nextStep.interviewFocus");
    expect(cardSource).toContain("TimeDisplay");
    expect(cardSource).not.toContain("ResumeLibraryCardDocument");
    expect(cardSource).not.toContain("record.resumeFileName");
    expect(cardSource).not.toContain("getResumeCardScoreLabel(record)");
    expect(cardSource).not.toContain("record.lastInterviewAt");
    expect(actionSource).toContain("ResumeLibraryIconActionButton");
    expect(actionSource).not.toContain("<ButtonGroup");
    expect(actionSource).toContain(
      "flex items-center justify-end gap-1 xl:flex-col xl:items-center",
    );
    expect(actionButtonSource).toContain('variant="ghost"');
    expect(actionButtonSource).toContain('size="icon"');
    expect(actionButtonSource).toContain("delayDuration={700}");
    expect(actionButtonSource).toContain("aria-label={label}");
    expect(actionSource).toContain("发起 AI 面试");
    expect(actionSource).toContain("更多操作");
  });

  it("reuses toolbar selection around the infinite virtual card list", () => {
    const listSource = source.slice(
      source.indexOf("function ResumeLibraryCardList("),
      source.indexOf("function ResumeLibraryPage("),
    );

    expect(listSource).toContain("<Toolbar");
    expect(listSource).toContain("bulkActionsSlot={bulkSlot}");
    expect(listSource).toContain("grid.bind.rowSelection");
    expect(listSource).not.toContain("<PaginationBar");
    expect(listSource).not.toContain("grid.bind.pagination");
    expect(listSource).toContain("useVirtualizer");
    expect(listSource).toContain("getScrollElement");
    expect(listSource).toContain("findVerticalScrollParent");
    expect(listSource).toContain("virtualizer.getVirtualItems()");
    expect(listSource).toContain("virtualizer.measureElement");
    expect(listSource).toContain("loadMoreRef");
    expect(listSource).toContain("IntersectionObserver");
    expect(listSource).toContain("fetchNextPage");
    expect(listSource).toContain("hasNextPage");
  });
});
