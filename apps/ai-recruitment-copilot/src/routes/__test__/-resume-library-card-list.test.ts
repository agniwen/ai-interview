import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../w.$slug.studio.resumes.tsx", import.meta.url), "utf-8");
const cardSourceFile = readFileSync(
  new URL("../../components/features/studio/resumes/resume-library-card.tsx", import.meta.url),
  "utf-8",
);

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
    const actionSource = cardSourceFile.slice(
      cardSourceFile.indexOf("function ResumeLibraryCardActions("),
      cardSourceFile.indexOf("export function ResumeLibraryCard("),
    );
    const actionButtonSource = cardSourceFile.slice(
      cardSourceFile.indexOf("function ResumeLibraryIconActionButton("),
      cardSourceFile.indexOf("function ResumeLibraryCardActions("),
    );
    const cardSource = cardSourceFile.slice(
      cardSourceFile.indexOf("export function ResumeLibraryCard("),
    );
    const avatarInteropSource = cardSourceFile.slice(
      cardSourceFile.indexOf('import AvvvatarsModule from "avvvatars-react";'),
      cardSourceFile.indexOf("interface ResumeLibraryCardProps"),
    );
    const skillsSource = cardSourceFile.slice(
      cardSourceFile.indexOf("function getResumeCardSkills("),
      cardSourceFile.indexOf("function getResumeCardSummary("),
    );
    const creatorMetaSource = cardSourceFile.slice(
      cardSourceFile.indexOf("function ResumeCardCreatorMeta("),
      cardSourceFile.indexOf("function ResumeCardProfileSnapshot("),
    );
    const profileSnapshotSource = cardSourceFile.slice(
      cardSourceFile.indexOf("function getLatestWorkLine("),
      cardSourceFile.indexOf("function getResumeCardSummary("),
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
    expect(cardSource).not.toContain("cursor-pointer");
    expect(cardSource).toContain("onClick={(event) => {");
    expect(cardSource).toContain("isResumeCardInteractiveClick(event)");
    expect(cardSource).toContain('onOpenDetail(record, "overview");');
    expect(cardSourceFile).toContain("function isResumeCardInteractiveClick");
    expect(cardSourceFile).toContain(
      "\"a,button,input,label,select,textarea,[role='button'],[role='menuitem'],[data-resume-card-interactive='true']\"",
    );
    expect(cardSource).toContain("decoration-transparent");
    expect(cardSource).toContain("hover:decoration-foreground/40");
    expect(cardSource).toContain("jobDescriptionTextClass");
    expect(cardSource).toContain("关联岗位：未绑定");
    expect(cardSource).not.toContain("pointer-events-none text-muted-foreground no-underline");
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
    expect(cardSourceFile).toContain("ml-22");
    expect(cardSourceFile).toContain("xl:ml-0");
    expect(cardSourceFile).toContain("content-start");
    expect(cardSourceFile).toContain("xl:self-start");
    expect(cardSourceFile).toContain("xl:pt-8.5");
    expect(cardSourceFile).not.toContain("content-center");
    expect(cardSourceFile).not.toContain("xl:self-center");
    expect(cardSourceFile).toContain("text-[11px]");
    expect(cardSourceFile).toContain("text-foreground text-sm");
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
    expect(listSource).toContain(
      "const canShowFloatingActionBar = canDeleteResumeLibrary && selectedIds.length > 0;",
    );
    expect(listSource).toContain("{canShowFloatingActionBar ? (");
    expect(listSource).toContain("<ResumeLibraryFloatingActionBar");
    expect(listSource).toContain("selectedCount={selectedIds.length}");
    expect(listSource).toContain("selectedItems={selectedItems}");
    expect(listSource).toContain("onClearSelection={() => grid.setRowSelection({})}");
    expect(listSource).toContain(
      "onRemoveItem={(id) => grid.setRowSelection((prev) => ({ ...prev, [id]: false }))}",
    );
    expect(listSource).toContain("onViewItem={(id) => {");
    expect(listSource).toContain("const record = records.find((item) => item.id === id);");
    expect(listSource).toContain("onOpenDetail(record);");
    expect(listSource).toContain("formatResumeCandidateTitle(record.candidateName, record.id)");
    expect(listSource).toContain("formatResumeLibraryJobDescriptionLabel(record)");
    expect(listSource).toContain("disabled={hasLockedSelection}");
    expect(listSource).toContain("disabledReason={bulkDeleteLockedReason}");
    expect(source).toContain(
      'from "@/components/features/studio/resumes/resume-library-floating-action-bar"',
    );
    expect(listSource).not.toContain("bulkActionsSlot={bulkSlot}");
    expect(listSource).not.toContain("批量删除 ({selectedIds.length})");
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

  it("resets selected rows when switching workspaces", () => {
    const pageSource = source.slice(
      source.indexOf("function ResumeLibraryPage("),
      source.indexOf("const [activeSort] = grid.sorting;"),
    );

    expect(pageSource).toContain('queryKeyBase: ["studio-resumes", slug]');
    expect(pageSource).toContain("const { setRowSelection } = grid;");
    expect(pageSource).toContain("useEffect(() => {");
    expect(pageSource).toContain("setRowSelection({});");
    expect(pageSource).toContain("}, [slug, setRowSelection]);");
  });

  it("clears selected rows when switching resume stage tabs", () => {
    const tabsSource = source.slice(
      source.indexOf("<Tabs"),
      source.indexOf("<ResumeLibraryCardList"),
    );

    expect(tabsSource).toContain("onValueChange={(value) => {");
    expect(tabsSource).toContain("setRowSelection({});");
    expect(tabsSource).toContain('grid.setFilter("stage", value === "all" ? "" : value);');
  });
});
