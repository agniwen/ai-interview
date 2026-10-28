import type { PartState } from "@assistant-ui/react";
import { describe, expect, it } from "vitest";
import { toToolChipStep } from "../tool-chips";

type ToolPartState = Extract<PartState, { type: "tool-call" }>;

function toolPart(overrides: Partial<ToolPartState>): ToolPartState {
  return {
    args: {},
    argsText: "{}",
    status: { type: "complete" },
    toolCallId: "call-1",
    toolName: "propose_job_description_patch",
    type: "tool-call",
    ...overrides,
  };
}

describe("toToolChipStep", () => {
  it("shows a running step until the tool returns", () => {
    expect(toToolChipStep(toolPart({ status: { type: "running" } })).status).toBe("running");
  });

  it("marks interrupted calls without a result as warnings", () => {
    const step = toToolChipStep(toolPart({ status: { reason: "cancelled", type: "incomplete" } }));

    expect(step).toMatchObject({ chip: "已中断", status: "warning" });
  });

  it("turns rejected patches into expandable warning details", () => {
    const step = toToolChipStep(
      toolPart({ result: { issues: ["绑定岗位至少需要一个。"], kind: "patch_rejected" } }),
    );

    expect(step).toMatchObject({
      detail: [{ text: "绑定岗位至少需要一个。", tone: "warning" }],
      status: "warning",
    });
  });
});
