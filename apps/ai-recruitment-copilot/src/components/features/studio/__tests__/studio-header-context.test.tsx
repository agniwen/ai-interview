// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  StudioHeaderProvider,
  useStudioHeaderOverride,
  useStudioHeaderOverrideValue,
} from "../studio-header-context";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function HeaderReader() {
  const override = useStudioHeaderOverrideValue();
  return <div data-testid="header-reader">{override ?? "default"}</div>;
}

function DetailOverride() {
  useStudioHeaderOverride(<span>返回招聘台 黄文浩</span>);
  return null;
}

function Harness({ showDetail }: { showDetail: boolean }) {
  return (
    <StudioHeaderProvider>
      <HeaderReader />
      {showDetail ? <DetailOverride /> : null}
    </StudioHeaderProvider>
  );
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("StudioHeaderProvider", () => {
  it("uses detail overrides and clears them when the detail route unmounts", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness showDetail={true} />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("返回招聘台 黄文浩");

    await act(async () => {
      root.render(<Harness showDetail={false} />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("default");

    act(() => root.unmount());
  });
});
