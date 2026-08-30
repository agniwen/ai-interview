import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecruitmentCopilotBrand } from "./recruitment-copilot-brand";

describe("RecruitmentCopilotBrand", () => {
  it("renders the theme-aware product icon in the shared sidebar brand", () => {
    const markup = renderToStaticMarkup(<RecruitmentCopilotBrand />);

    expect(markup).toContain("AI Hiring Copilot");
    expect(markup).toContain('data-slot="recruitment-copilot-mark"');
    expect(markup).toContain("/favicon-light.ico");
    expect(markup).toContain("dark:bg-[url(&#x27;/favicon-dark.ico&#x27;)]");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("size-6");
    expect(markup).toContain("group-data-[collapsible=icon]:size-7");
    expect(markup).toContain("group-data-[collapsible=icon]:justify-center");
    expect(markup).toContain("group-data-[collapsible=icon]:opacity-0");
  });
});
