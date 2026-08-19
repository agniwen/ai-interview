import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlatformSidebarShell } from "./platform-sidebar-shell";

describe("PlatformSidebar", () => {
  it("renders the shared recruitment copilot brand in the header", () => {
    const markup = renderToStaticMarkup(
      <PlatformSidebarShell>
        <main />
      </PlatformSidebarShell>,
    );

    expect(markup).toContain('data-slot="recruitment-copilot-brand"');
    expect(markup).toContain('data-slot="recruitment-copilot-mark"');
    expect(markup).toContain("AI Recruitment Copilot");
  });
});
