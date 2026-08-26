import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tabsSource = readFileSync(new URL("../tabs.tsx", import.meta.url), "utf-8");
const launchInterviewDialogSource = readFileSync(
  new URL("../../features/studio/resumes/launch-interview-dialog.tsx", import.meta.url),
  "utf-8",
);
const jobDescriptionDialogSource = readFileSync(
  new URL(
    "../../features/studio/job-descriptions/job-description-form-dialog.tsx",
    import.meta.url,
  ),
  "utf-8",
);

describe("page-style tab motion", () => {
  it("uses the shared page-side-by-side lifecycle tokens on the content layer", () => {
    expect(tabsSource).toContain('motion?: "page"');
    expect(tabsSource).toContain("transition-[opacity,translate,filter]");
    expect(tabsSource).toContain("duration-[var(--duration-fast)]");
    expect(tabsSource).toContain("ease-[var(--ease-smooth-out)]");
    expect(tabsSource).toContain("data-[activation-direction=right]:data-starting-style");
    expect(tabsSource).toContain("data-[activation-direction=right]:data-ending-style");
    expect(tabsSource).toContain("translate-x-(--distance-base)");
    expect(tabsSource).toContain("blur-(--blur-medium)");
    expect(tabsSource).toContain("data-ending-style:absolute");
    expect(tabsSource).toContain("motion-reduce:transition-none");
  });

  it("uses natural-height page motion in multi-panel recruiting dialogs", () => {
    expect(launchInterviewDialogSource).not.toContain("AnimatedHeight");
    expect(launchInterviewDialogSource.match(/<TabsContent motion="page"/g)).toHaveLength(3);
    expect(jobDescriptionDialogSource.match(/<TabsContent motion="page"/g)).toHaveLength(3);
  });
});
