// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { CandidateQuestionChecklist } from "./candidate-question-checklist";

// SAFETY: React's test-only act flag is intentionally attached to the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const [asked, setAsked] = useState(new Set<string>());
  return (
    <CandidateQuestionChecklist
      questions={[1, 2].map((order) => ({
        difficulty: "medium",
        dimension: "business",
        evaluationFocus: "考核说明",
        followUpDirections: "追问说明",
        order,
        question: `项目问题 ${order}`,
      }))}
      asked={asked}
      onCheckedChange={(key, checked) =>
        setAsked((current) => {
          const next = new Set(current);
          if (checked) {
            next.add(key);
          } else {
            next.delete(key);
          }
          return next;
        })
      }
    />
  );
}
it("marks only the selected question as asked and allows undo without striking supporting notes", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => root.render(<Harness />));
    const checkbox = container.querySelector<HTMLButtonElement>('[role="checkbox"]');
    expect(checkbox?.getAttribute("aria-checked")).toBe("false");
    await act(() => checkbox?.click());
    const items = container.querySelectorAll("li");
    expect(checkbox?.getAttribute("aria-checked")).toBe("true");
    expect(items[0]?.textContent).toContain("已提问");

    expect(items[1]?.textContent).not.toContain("已提问");
    await act(() => checkbox?.click());
    expect(items[0]?.textContent).not.toContain("已提问");
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});
