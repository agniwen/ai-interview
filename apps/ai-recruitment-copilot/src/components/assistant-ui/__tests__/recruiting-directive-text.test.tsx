// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RecruitingDirectiveText } from "../recruiting-directive-text";

const mocks = vi.hoisted(() => ({
  openCandidateDetail: vi.fn(),
}));

vi.mock("../recruiting-copilot-context", () => ({
  useRecruitingCopilotContextOptional: () => ({
    openCandidateDetail: mocks.openCandidateDetail,
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("RecruitingDirectiveText", () => {
  it("renders a resume mention without exposing its directive syntax", () => {
    const html = renderToStaticMarkup(
      <RecruitingDirectiveText
        status={{ type: "complete" }}
        text=":resume_record[张妍]{name=e56ac47d-99a2-4e02-98fb-fa96efd6450c}这个人如何"
        type="text"
      />,
    );

    expect(html).toContain("@张妍");
    expect(html).toContain("这个人如何");
    expect(html).not.toContain(":resume_record[");
  });

  it.each([
    ["resume_record", "resume-1", "resume_record"],
    ["resume_pool", "pool:pool-1", "resume_pool"],
  ] as const)("opens %s mentions in the candidate detail modal", async (type, id, kind) => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(() => {
      root.render(
        <RecruitingDirectiveText
          status={{ type: "complete" }}
          text={`:${type}[张妍]{name=${id}}`}
          type="text"
        />,
      );
    });

    const mention = container.querySelector("button");
    expect(mention?.textContent).toBe("@张妍");

    await act(() => {
      mention?.click();
    });

    expect(mocks.openCandidateDetail).toHaveBeenCalledWith({ id, kind });

    await act(() => root.unmount());
  });
});
