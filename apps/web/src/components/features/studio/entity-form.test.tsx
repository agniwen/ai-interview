// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { enableReactActEnvironment, renderInAct, unmountInAct } from "@/test-utils/react-act";
import { useEntityForm } from "./entity-form";

enableReactActEnvironment();
const schema = z.object({ name: z.string() });

function Harness({ open, name }: { open: boolean; name: string }) {
  const { form } = useEntityForm({
    buildValues: () => ({ name }),
    onSubmit: () => {},
    open,
    schema,
  });
  return (
    <>
      <form.Subscribe selector={(state) => state.values.name}>
        {(value) => <output>{value}</output>}
      </form.Subscribe>
      <button onClick={() => form.setFieldValue("name", "编辑中的草稿")} type="button">
        编辑
      </button>
    </>
  );
}

describe("useEntityForm open lifecycle", () => {
  it("preserves edits on rerender and reads fresh defaults on reopening in StrictMode", async () => {
    const { root, container } = await renderInAct(
      <StrictMode>
        <Harness name="初始名称" open />
      </StrictMode>,
    );
    try {
      expect(container.querySelector("output")?.textContent).toBe("初始名称");
      act(() => container.querySelector("button")?.click());
      await act(() =>
        root.render(
          <StrictMode>
            <Harness name="服务器新名称" open />
          </StrictMode>,
        ),
      );
      expect(container.querySelector("output")?.textContent).toBe("编辑中的草稿");
      await act(() =>
        root.render(
          <StrictMode>
            <Harness name="服务器新名称" open={false} />
          </StrictMode>,
        ),
      );
      await act(() =>
        root.render(
          <StrictMode>
            <Harness name="重新打开的名称" open />
          </StrictMode>,
        ),
      );
      expect(container.querySelector("output")?.textContent).toBe("重新打开的名称");
    } finally {
      await unmountInAct(root);
    }
  });
});
