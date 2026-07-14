import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeModeBadge, getCodeModeCall } from "../code-mode-badge";
import { ToolCallProvider } from "@/services/tool-call-provider";

const renderWithProvider = (node: ReactNode) =>
  render(
    <ToolCallProvider
      approveToolcall={vi.fn()}
      declineToolcall={vi.fn()}
      approveToolcallGenerate={vi.fn()}
      declineToolcallGenerate={vi.fn()}
      approveNetworkToolcall={vi.fn()}
      declineNetworkToolcall={vi.fn()}
      isRunning={false}
      toolCallApprovals={{}}
      networkToolCallApprovals={{}}
    >
      {node}
    </ToolCallProvider>,
  );

afterEach(() => cleanup());

describe("getCodeModeCall", () => {
  it("detects a code mode call from object args and a result shape", () => {
    const call = getCodeModeCall(
      { code: "return 1 + 1;" },
      { logs: ["done"], result: 2, success: true },
    );

    expect(call).toEqual({
      code: "return 1 + 1;",
      result: { logs: ["done"], result: 2, success: true },
    });
  });

  it("detects a code mode call before the program has run (no result)", () => {
    expect(getCodeModeCall({ code: "return 1;" })).toEqual({ code: "return 1;" });
  });

  it("parses code from a stringified args payload", () => {
    const call = getCodeModeCall(JSON.stringify({ code: "return 3;" }), {
      error: { message: "x" },
      success: false,
    });
    expect(call?.code).toBe("return 3;");
  });

  it("returns null when args have no string code field", () => {
    expect(getCodeModeCall({ command: "ls" }, { success: true })).toBeNull();
    expect(getCodeModeCall({ code: 42 })).toBeNull();
  });

  it("returns null when the result is not a CodeModeResult", () => {
    // A tool that happens to take `code` but returns an unrelated shape.
    expect(getCodeModeCall({ code: "x" }, { rows: [1, 2, 3] })).toBeNull();
    expect(getCodeModeCall({ code: "x" }, "plain string result")).toBeNull();
  });

  it("returns null for unparseable string args", () => {
    expect(getCodeModeCall("not json")).toBeNull();
  });
});

describe("CodeModeBadge", () => {
  it("renders the program, result, and logs when expanded", () => {
    renderWithProvider(
      <CodeModeBadge
        toolName="execute_typescript"
        code="const x = await external_getOrders({ limit: 5 });\nreturn x;"
        result={{ logs: ["fetched 5 orders"], result: { count: 5 }, success: true }}
        toolCallId="call-1"
        toolApprovalMetadata={undefined}
        isNetwork={false}
      />,
    );

    // Badge starts collapsed; expand it.
    fireEvent.click(screen.getByText("execute_typescript"));

    expect(screen.getByTestId("code-mode-program").textContent).toContain("external_getOrders");
    expect(screen.getByTestId("code-mode-result")).toBeTruthy();
    expect(screen.getByTestId("code-mode-logs").textContent).toContain("fetched 5 orders");
    expect(screen.queryByTestId("code-mode-error")).toBeNull();
  });

  it("pretty-prints a single-line program into multiple lines", async () => {
    renderWithProvider(
      <CodeModeBadge
        toolName="execute_typescript"
        code="const a = await external_one({}); const b = await external_two({}); return a + b;"
        result={{ result: 3, success: true }}
        toolCallId="call-fmt"
        toolApprovalMetadata={undefined}
        isNetwork={false}
      />,
    );

    fireEvent.click(screen.getByText("execute_typescript"));

    // The raw program is a single line (no newlines). Formatting is async
    // (prettier loads lazily), so wait for the reflowed, multi-line source.
    await waitFor(() => {
      const text = screen.getByTestId("code-mode-program").textContent ?? "";
      expect(text).toContain("external_one");
      expect(text).toContain("external_two");
      // prettier splits the three statements onto separate lines.
      expect(text.split("\n").length).toBeGreaterThan(1);
    });
  });

  it("renders an error with its line number", () => {
    renderWithProvider(
      <CodeModeBadge
        toolName="sales_code"
        code="throw new Error('boom');"
        result={{ error: { line: 1, message: "boom", name: "Error" }, success: false }}
        toolCallId="call-2"
        toolApprovalMetadata={undefined}
        isNetwork={false}
      />,
    );

    fireEvent.click(screen.getByText("sales_code"));

    const error = screen.getByTestId("code-mode-error");
    expect(error.textContent).toContain("Error: boom");
    expect(error.textContent).toContain("line 1");
    expect(screen.queryByTestId("code-mode-result")).toBeNull();
    expect(screen.queryByTestId("code-mode-logs")).toBeNull();
  });
});
