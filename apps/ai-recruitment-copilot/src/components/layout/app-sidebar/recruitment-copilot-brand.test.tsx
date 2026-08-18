import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecruitmentCopilotBrand } from "./recruitment-copilot-brand";

describe("RecruitmentCopilotBrand", () => {
  it("renders the animated mark with theme-aware body and eye colors", () => {
    const markup = renderToStaticMarkup(<RecruitmentCopilotBrand />);

    expect(markup).toContain("AI Recruitment Copilot");
    expect(markup).toContain("text-[#002FA7]");
    expect(markup).toContain("dark:text-white");
    expect(markup).toContain("fill-white");
    expect(markup).toContain("dark:fill-background");
    expect(markup).toContain("recruitment-copilot-eye-a");
    expect(markup).toContain("prefers-reduced-motion: reduce");
    expect(markup).toContain("group-data-[collapsible=icon]:size-7");
    expect(markup).toContain("group-data-[collapsible=icon]:justify-center");
    expect(markup).toContain("group-data-[collapsible=icon]:opacity-0");
  });
});
