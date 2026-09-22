// @vitest-environment jsdom
import { act, useState } from "react";
import { Position, ReactFlow } from "@xyflow/react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfferApprovalTemplateNode } from "@app/db-schema/offer-approval";
import TemplateFlowEditor, {
  ApprovalInsertEdge,
  getApprovalDropIndex,
} from "./template-flow-editor";

// SAFETY: React uses this optional global flag to enable act warnings in tests.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const initial: OfferApprovalTemplateNode[] = [
  { fixedUserId: "alice", id: "first", resolverType: "fixed_member" },
  { fixedUserId: null, id: "second", resolverType: "recruiting_owner" },
];

let current: OfferApprovalTemplateNode[];
function Editor({ disabled = false }: { disabled?: boolean }) {
  const [nodes, setNodes] = useState(initial);
  return (
    <TemplateFlowEditor
      nodes={nodes}
      onChange={(next) => {
        current = next;
        setNodes(next);
      }}
      approvers={[{ label: "Alice", value: "alice" }]}
      disabled={disabled}
    />
  );
}

describe("审批流程画布编辑", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    current = initial;
    // jsdom has no layout engine; viewport measurements are verified in the browser.
    vi.stubGlobal("matchMedia", (media: string) =>
      Object.assign(new EventTarget(), { matches: false, media }),
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observed = new Set<Element>();
        observe(element: Element) {
          this.observed.add(element);
        }
        unobserve(element: Element) {
          this.observed.delete(element);
        }
        disconnect() {
          this.observed.clear();
        }
      },
    );
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  function button(text: string) {
    const found = [...host.querySelectorAll("button")].find(
      (item) => item.textContent?.includes(text) || item.getAttribute("aria-label") === text,
    );
    if (!found) {
      throw new Error(`Missing button: ${text}`);
    }
    return found;
  }
  function click(text: string) {
    act(() => button(text).click());
  }

  it("inserts between nodes, reorders the selected node, and deletes without changing other node identities", () => {
    act(() => root.render(<Editor />));
    click("添加审批节点");
    act(() =>
      button("拖动调整审批 3 · 固定审批人顺序").dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowUp" }),
      ),
    );
    expect(current.map((node) => node.id)).toEqual(["first", expect.any(String), "second"]);
    const insertedId = current[1].id;
    act(() =>
      button("拖动调整审批 2 · 固定审批人顺序").dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      ),
    );
    expect(current.map((node) => node.id)).toEqual(["first", "second", insertedId]);
    click("删除此节点");
    expect(current).toEqual(initial);
  });

  it("renders the insertion control at the edge midpoint and passes its insertion position", () => {
    const insert = vi.fn();
    act(() =>
      root.render(
        <ReactFlow nodes={[]} edges={[]}>
          <svg>
            <ApprovalInsertEdge
              id="test-edge"
              source="first"
              target="second"
              sourceX={120}
              sourceY={100}
              targetX={120}
              targetY={200}
              sourcePosition={Position.Bottom}
              targetPosition={Position.Top}
              data={{ canInsert: true, insertionIndex: 1, onInsert: insert, sourceTitle: "审批 1" }}
            />
          </svg>
        </ReactFlow>,
      ),
    );
    const add = button("在审批 1后添加审批节点");
    expect(add.parentElement?.style.transform).toBe(
      "translate(-50%, -50%) translate(120px, 150px)",
    );
    expect(add.style.transform).toBe("");
    expect(add.closest(".react-flow__edgelabel-renderer")).not.toBeNull();
    click("在审批 1后添加审批节点");
    expect(insert).toHaveBeenCalledWith(1);
  });

  it("clears the fixed member when changing to a dynamic resolver", () => {
    act(() => root.render(<Editor />));
    const select = host.querySelector<HTMLButtonElement>("#approval-resolver");
    if (!select) {
      throw new Error("Missing resolver select");
    }
    act(() => select.click());
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
      item.textContent?.includes("岗位汇报上级"),
    );
    if (!option) {
      throw new Error("Missing reporting manager option");
    }
    act(() => option.click());
    expect(current[0]).toEqual({
      fixedUserId: null,
      id: "first",
      resolverType: "job_reporting_manager",
    });
    expect(current[1]).toEqual(initial[1]);
  });

  it("shows a member avatar only on a fixed approver node", () => {
    act(() => root.render(<Editor />));
    const fixedNode = host.querySelector('[data-id="approval-first"]');
    const dynamicNode = host.querySelector('[data-id="approval-second"]');
    expect(fixedNode?.querySelector('[aria-label="Alice的头像"]')).not.toBeNull();
    expect(dynamicNode?.querySelector('[data-slot="avatar"]')).toBeNull();
  });

  it("clamps drop targets and switches slots at the midpoint", () => {
    expect(getApprovalDropIndex(-500, 5)).toBe(0);
    expect(getApprovalDropIndex(244, 5)).toBe(0);
    expect(getApprovalDropIndex(246, 5)).toBe(1);
    expect(getApprovalDropIndex(530, 5)).toBe(2);
    expect(getApprovalDropIndex(2000, 5)).toBe(4);
    expect(getApprovalDropIndex(2000, 1)).toBe(0);
  });

  it("enforces one to five nodes and disables edits while saving", () => {
    act(() => root.render(<Editor />));
    click("添加审批节点");
    click("添加审批节点");
    click("添加审批节点");
    expect(current).toHaveLength(5);
    expect(button("添加审批节点").disabled).toBe(true);
    click("删除此节点");
    click("删除此节点");
    click("删除此节点");
    click("删除此节点");
    expect(current).toHaveLength(1);
    expect(button("删除此节点").disabled).toBe(true);
    act(() => root.render(<Editor disabled />));
    expect(button("添加审批节点").disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>("#approval-resolver")?.disabled).toBe(true);
  });
});
