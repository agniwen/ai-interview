import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

function readCustomProperty(source: string, property: string) {
  return source.match(new RegExp(`${property}:\\s*([^;]+);`))?.[1]?.trim();
}

describe("animation motion regressions", () => {
  it("keeps the complete Web and Desktop motion scales identical", () => {
    const webStyles = readSource("apps/ai-recruitment-copilot/src/styles/globals.css");
    const desktopStyles = readSource(
      "apps/ai-recruitment-copilot-desktop/src/renderer/src/assets/main.css",
    );
    const properties = [
      "--duration-stagger",
      "--duration-micro",
      "--duration-quick",
      "--duration-fast",
      "--duration-medium",
      "--duration-slow",
      "--duration-very-slow",
      "--ease-smooth-out",
      "--ease-in-out",
      "--ease-out",
      "--ease-linear",
      "--ease-bounce",
      "--ease-bounce-strong",
      "--distance-micro",
      "--distance-small",
      "--distance-base",
      "--distance-medium",
      "--distance-large",
      "--scale-large",
      "--scale-medium",
      "--scale-small",
      "--scale-tiny",
      "--blur-small",
      "--blur-medium",
      "--blur-large",
      "--pulse-dur",
      "--pulse-count",
      "--pulse-min",
      "--reveal-dur",
      "--reveal-blur",
      "--reveal-ease",
      "--toggle-duration",
      "--toggle-overshoot",
      "--toggle-track-duration",
      "--toggle-ease",
    ];

    for (const property of properties) {
      const webValue = readCustomProperty(webStyles, property);
      const desktopValue = readCustomProperty(desktopStyles, property);
      expect(webValue, `missing Web ${property}`).toBeDefined();
      expect(desktopValue, `missing Desktop ${property}`).toBe(webValue);
    }
  });

  it("keeps skeleton reveal orchestration identical on Web and Desktop", () => {
    const webReveal = readSource(
      "apps/ai-recruitment-copilot/src/components/ui/skeleton-reveal.tsx",
    );
    const desktopReveal = readSource(
      "apps/ai-recruitment-copilot-desktop/src/renderer/src/components/ui/skeleton-reveal.tsx",
    );

    expect(desktopReveal).toBe(webReveal);
    expect(webReveal).toContain('data-state={loading ? "loading" : "revealed"}');
    expect(webReveal).toContain('layout = "flow"');
    expect(webReveal).toContain('loading && "is-resetting"');
    expect(webReveal).toContain("const shouldRenderSkeleton = loading || showSkeleton;");
    expect(webReveal).toContain("setShowSkeleton(false)");
  });

  it("honors the operating-system reduced-motion preference in both Motion roots", () => {
    const webRoot = readSource("apps/ai-recruitment-copilot/src/routes/__root.tsx");
    const desktopRoot = readSource("apps/ai-recruitment-copilot-desktop/src/renderer/src/main.tsx");

    expect(webRoot).toContain('<MotionConfig reducedMotion="user">');
    expect(desktopRoot).toContain('<MotionConfig reducedMotion="user">');
  });

  it("keeps camera tiles physical and reduced-motion aware", () => {
    const tileView = readSource(
      "apps/ai-recruitment-copilot/src/components/agents-ui/blocks/agent-session-view-01/components/tile-view.tsx",
    );

    expect(tileView).toContain("useReducedMotion");
    expect(tileView).toContain("scale: reduceMotion ? 1 : 0.95");
    expect(tileView).not.toContain("scale: 0");
  });

  it("keeps the text shimmer on CSS with a static reduced-motion state", () => {
    const shimmer = readSource(
      "apps/ai-recruitment-copilot/src/components/ai-elements/shimmer.tsx",
    );
    const globalStyles = readSource("apps/ai-recruitment-copilot/src/styles/globals.css");

    expect(shimmer).toContain("ai-text-shimmer");
    expect(shimmer).not.toContain('from "motion/react"');
    expect(globalStyles).toContain("@keyframes text-shimmer");
    expect(globalStyles).toContain(".ai-text-shimmer {\n    animation: none !important;");
  });

  it("keeps shared surface motion on semantic tokens with reduced-motion exits", () => {
    const globalStyles = readSource("apps/ai-recruitment-copilot/src/styles/globals.css");
    const cossStyle = readSource("apps/ai-recruitment-copilot/src/components/ui/coss-style.ts");
    const dialog = readSource("apps/ai-recruitment-copilot/src/components/ui/dialog.tsx");
    const alertDialog = readSource(
      "apps/ai-recruitment-copilot/src/components/ui/alert-dialog.tsx",
    );
    const modal = readSource("apps/ai-recruitment-copilot/src/components/ui/modal.tsx");
    const sheet = readSource("apps/ai-recruitment-copilot/src/components/ui/sheet.tsx");
    const tabs = readSource("apps/ai-recruitment-copilot/src/components/ui/tabs.tsx");

    expect(globalStyles).toContain("--duration-quick: 150ms;");
    expect(globalStyles).toContain("--duration-fast: 250ms;");
    expect(globalStyles).toContain("--ease-smooth-out: cubic-bezier(0.22, 1, 0.36, 1);");
    expect(cossStyle).toContain("cossModalOverlayMotionClass");
    expect(cossStyle).toContain("cossModalMotionClass");
    expect(cossStyle).toContain("cossTooltipMotionClass");
    expect(cossStyle).toContain("data-starting-style:scale-(--scale-large)");
    expect(cossStyle).toContain("data-ending-style:duration-[var(--duration-quick)]");
    expect(cossStyle).toContain("motion-reduce:transition-none");
    expect(dialog).toContain("cossModalMotionClass");
    expect(alertDialog).toContain("cossModalMotionClass");
    expect(modal).toContain("cossModalMotionClass");
    expect(sheet).toContain("duration-[var(--duration-slow)]");
    expect(sheet).toContain("data-ending-style:duration-[var(--duration-medium)]");
    expect(sheet).toContain("data-starting-style:translate-x-full");
    expect(sheet).toContain("motion-reduce:transition-none");
    expect(tabs).toContain("motion-reduce:transition-none");
  });

  it("does not remount dialog roots when their open state or target changes", () => {
    const launchInterview = readSource(
      "apps/ai-recruitment-copilot/src/components/features/studio/resumes/launch-interview-dialog.tsx",
    );
    const formTemplates = readSource(
      "apps/ai-recruitment-copilot/src/components/features/studio/forms/form-template-management-page.tsx",
    );
    const mailAccounts = readSource(
      "apps/ai-recruitment-copilot/src/components/features/platform/mail-ingest-accounts/mail-ingest-accounts-grid.tsx",
    );
    const offerStage = readSource(
      "apps/ai-recruitment-copilot/src/components/features/studio/offer-stage-panel.tsx",
    );
    const workspacePermissions = readSource(
      "apps/ai-recruitment-copilot/src/components/features/studio/members/workspace-permissions-section.tsx",
    );
    const interviewQuestionTemplates = readSource(
      "apps/ai-recruitment-copilot/src/components/features/studio/interview-questions/interview-question-template-management-page.tsx",
    );
    const jobDescriptions = readSource(
      "apps/ai-recruitment-copilot/src/components/features/studio/job-descriptions/job-description-management-page.tsx",
    );

    expect(launchInterview).not.toContain('key={recordId ?? "empty"}');
    expect(formTemplates).not.toContain('crud.formDialogOpen ? "open" : "closed"');
    expect(mailAccounts).not.toMatch(/editingRow \? `\$\{editingRow\.organization\.id\}/);
    expect(offerStage).not.toContain('key={createOpen ? "create-open" : "create-closed"}');
    expect(offerStage).not.toContain('key={respondTarget?.id ?? "closed"}');
    expect(workspacePermissions).not.toMatch(
      /roleFormState \? `\$\{roleFormState\.mode\}:\$\{roleFormState\.role\?\.id/,
    );
    expect(interviewQuestionTemplates).not.toContain("key={editorDialogKey}");
    expect(jobDescriptions).not.toContain("key={editorDialogKey}");
  });

  it("uses the same interaction-gated toggle recipe on Web and Desktop", () => {
    const webSwitch = readSource("apps/ai-recruitment-copilot/src/components/ui/switch.tsx");
    const desktopSwitch = readSource(
      "apps/ai-recruitment-copilot-desktop/src/renderer/src/components/ui/switch.tsx",
    );
    const webStyles = readSource("apps/ai-recruitment-copilot/src/styles/globals.css");

    expect(desktopSwitch).toBe(webSwitch);
    expect(webSwitch).toContain("t-toggle-thumb");
    expect(webSwitch).toContain('dataset.motionReady = ""');
    expect(webStyles).toContain("animation: arc-toggle-on var(--toggle-duration)");
    expect(webStyles).toContain("animation: arc-toggle-off var(--toggle-duration)");
    expect(webStyles).toContain("--toggle-travel: calc(100% - 2px)");
    expect(webStyles).toContain(".t-toggle-thumb {\n    animation: none !important;");
  });

  it("animates shared progress through transforms instead of width", () => {
    const progress = readSource("apps/ai-recruitment-copilot/src/components/ui/progress.tsx");

    expect(progress).toMatch(/transform: `scaleX\(\$\{progressScale\}\)`/);
    expect(progress).toContain('width: "100%"');
    expect(progress).not.toContain("transition-all");
  });

  it("preserves the original coordinated desktop sidebar transition", () => {
    const sidebar = readSource("apps/ai-recruitment-copilot/src/components/ui/sidebar.tsx");

    expect(sidebar).toContain("transition-[width] duration-200 ease-linear");
    expect(sidebar).toContain("transition-[left,right,width] duration-200 ease-linear");
    expect(sidebar).toContain("transition-[margin,opacity] duration-200 ease-linear");
    expect(sidebar).toContain("transition-[width,height,padding]");
  });

  it("signals when animated height changes finish", () => {
    const animatedHeight = readSource(
      "apps/ai-recruitment-copilot/src/components/features/motion/animated-height.tsx",
    );

    expect(animatedHeight).toContain('data-slot="animated-height"');
    expect(animatedHeight).toContain("onAnimationComplete");
    expect(animatedHeight).toContain("ANIMATED_HEIGHT_COMPLETE_EVENT");
  });
});
