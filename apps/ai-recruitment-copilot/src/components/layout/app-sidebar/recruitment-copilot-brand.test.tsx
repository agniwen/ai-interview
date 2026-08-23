import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecruitmentCopilotBrand } from "./recruitment-copilot-brand";

describe("RecruitmentCopilotBrand", () => {
  it("renders the animated Blobatar black in light mode and white in dark mode", () => {
    const markup = renderToStaticMarkup(<RecruitmentCopilotBrand />);

    expect(markup).toContain("AI Recruitment Copilot");
    expect(markup).toContain('data-slot="recruitment-copilot-mark"');
    expect(markup).toContain("mo-root");
    expect(markup).toContain("mo-always");
    expect(markup).toContain("text-black");
    expect(markup).not.toContain("text-primary");
    expect(markup).toContain("dark:text-white");
    expect(markup).toContain("--mo-head:currentColor");
    expect(markup).toContain("--mo-eye:var(--background)");
    expect(markup).toContain("group-data-[collapsible=icon]:size-7");
    expect(markup).toContain("group-data-[collapsible=icon]:justify-center");
    expect(markup).toContain("group-data-[collapsible=icon]:opacity-0");
    expect(markup).not.toContain("recruitment-copilot-eye-a");
  });
});
