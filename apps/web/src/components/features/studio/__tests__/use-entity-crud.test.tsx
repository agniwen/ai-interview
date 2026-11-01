// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useEntityCrud } from "../use-entity-crud";

// SAFETY: React reads this global to enable act() in a non-test-renderer environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Item {
  id: string;
}

type Crud = ReturnType<typeof useEntityCrud<Item, Item>>;

interface CrudRef {
  current: Crud | null;
}

function deferred<T>() {
  return Promise.withResolvers<T>();
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

interface HarnessProps {
  loadDetail: (record: Item) => Promise<Item | null>;
  onRender: (crud: Crud) => void;
}

function Harness({ loadDetail, onRender }: HarnessProps) {
  onRender(
    useEntityCrud<Item, Item>({
      deleteEntity: () => Promise.resolve(new Response("{}")),
      invalidate: () => {},
      loadDetail,
      messages: { deleteSuccess: "已删除", loadDetailError: "加载失败" },
      openBeforeLoad: true,
    }),
  );
  return null;
}

function renderCrud(loadDetail: (record: Item) => Promise<Item | null>) {
  const ref: CrudRef = { current: null };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <Harness
        loadDetail={loadDetail}
        onRender={(crud) => {
          ref.current = crud;
        }}
      />,
    ),
  );
  return () => {
    if (!ref.current) {
      throw new Error("hook not rendered");
    }
    return ref.current;
  };
}

describe("useEntityCrud openBeforeLoad", () => {
  it("opens the dialog before the detail resolves, then fills the record", async () => {
    const detail = deferred<Item | null>();
    const crud = renderCrud(() => detail.promise);

    let opening: Promise<void> = Promise.resolve();
    act(() => {
      opening = crud().openEdit({ id: "a" });
    });
    expect(crud().formDialogOpen).toBe(true);
    expect(crud().detailLoading).toBe(true);
    expect(crud().editingRecord).toBeNull();

    await act(async () => {
      detail.resolve({ id: "a" });
      await opening;
    });
    expect(crud().detailLoading).toBe(false);
    expect(crud().editingRecord).toEqual({ id: "a" });
  });

  it("closes the dialog when the detail is missing", async () => {
    const crud = renderCrud(() => Promise.resolve(null));

    await act(() => crud().openEdit({ id: "gone" }));

    expect(crud().formDialogOpen).toBe(false);
    expect(crud().detailLoading).toBe(false);
  });

  it("ignores a detail that resolves after the dialog was closed", async () => {
    const detail = deferred<Item | null>();
    const crud = renderCrud(() => detail.promise);

    let opening: Promise<void> = Promise.resolve();
    act(() => {
      opening = crud().openEdit({ id: "a" });
    });
    act(() => crud().onFormOpenChange(false));

    await act(async () => {
      detail.resolve({ id: "a" });
      await opening;
    });
    expect(crud().formDialogOpen).toBe(false);
    expect(crud().editingRecord).toBeNull();
  });
});
