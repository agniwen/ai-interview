// @vitest-environment jsdom
import { act } from "react";
import type { CellContext } from "@tanstack/react-table";
import { describe, expect, it, vi } from "vitest";
import type { DataGridFeatures } from "../../table-features";
import { actionsColumn } from "../actions-column";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  enableReactActEnvironment,
  renderInAct,
  unmountInAct,
  waitForUi,
} from "@/test-utils/react-act";

enableReactActEnvironment();

describe("disabled action explanations", () => {
  it.each(["inline", "menu"] as const)(
    "exposes the %s reason on focus without executing the action",
    async (placement) => {
      const onClick = vi.fn();
      const column = actionsColumn<{ id: string }>({
        [placement]: [
          {
            disabled: () => true,
            disabledReason: () => "面试已结束，不可编辑。",
            label: "编辑",
            onClick,
          },
        ],
      });
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- TanStack permits a string renderer; this fixture requires the callable renderer.
      if (typeof column.cell !== "function") {
        throw new TypeError("Missing action renderer");
      }
      // SAFETY: The action renderer only reads row.original from its cell context.
      const context = { row: { original: { id: "round-1" } } } as CellContext<
        DataGridFeatures,
        { id: string }
      >;
      const { root, container } = await renderInAct(
        <TooltipProvider delay={0}>{column.cell(context)}</TooltipProvider>,
      );
      try {
        if (placement === "menu") {
          act(() => {
            container.querySelector<HTMLButtonElement>('[aria-label="更多操作"]')?.click();
          });
          await waitForUi(() => expect(document.querySelector('[role="menuitem"]')).not.toBeNull());
        }
        const disabled = document.querySelector<HTMLElement>('[aria-disabled="true"]');
        expect(disabled).not.toBeNull();
        const trigger = placement === "menu" ? disabled?.parentElement : disabled;
        act(() => {
          document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
          trigger?.focus();
          trigger?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
          trigger?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        });
        await waitForUi(() =>
          expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent).toContain(
            "面试已结束，不可编辑。",
          ),
        );
        act(() => {
          disabled?.click();
        });
        expect(onClick).not.toHaveBeenCalled();
      } finally {
        await unmountInAct(root);
        container.remove();
      }
    },
  );
});
