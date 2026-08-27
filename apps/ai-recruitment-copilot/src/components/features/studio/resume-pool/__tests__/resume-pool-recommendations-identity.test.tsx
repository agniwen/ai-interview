// @vitest-environment jsdom

import * as React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRecordOwnedOpenState } from "../resume-pool-details";

// SAFETY: React's test environment flag is an optional global configured by the test runtime.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

function RecordOwnedRecommendationsHarness({
  onRequest,
  recordId,
}: {
  onRequest: (recordId: string) => void;
  recordId: string;
}) {
  const [open, setOpen, ownerRecordId, handleOpenChangeComplete] =
    useRecordOwnedOpenState(recordId);
  React.useEffect(() => {
    if (open) {
      onRequest(ownerRecordId);
    }
  }, [onRequest, open, ownerRecordId]);

  return (
    <div data-open={String(open)} data-owner-record-id={ownerRecordId}>
      <button onClick={() => setOpen(true)} type="button">
        打开推荐
      </button>
      <button onClick={() => setOpen(false)} type="button">
        关闭推荐
      </button>
      <button onClick={() => handleOpenChangeComplete(false)} type="button">
        退出结束
      </button>
    </div>
  );
}

describe("resume pool recommendation dialog identity", () => {
  it("closes on the first new-record commit without requesting it and retains the exit owner", async () => {
    const onRequest = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const renderHarness = (recordId: string) => (
      <RecordOwnedRecommendationsHarness onRequest={onRequest} recordId={recordId} />
    );

    await React.act(async () => {
      root.render(renderHarness("resume-a"));
      await Promise.resolve();
    });
    await React.act(async () => {
      document.querySelector<HTMLButtonElement>("button")?.click();
      await Promise.resolve();
    });
    expect(onRequest).toHaveBeenCalledWith("resume-a");
    onRequest.mockClear();

    await React.act(async () => {
      root.render(renderHarness("resume-b"));
      await Promise.resolve();
    });

    const state = document.querySelector<HTMLElement>("[data-open]");
    expect(state?.dataset.open).toBe("false");
    expect(state?.dataset.ownerRecordId).toBe("resume-a");
    expect(onRequest).not.toHaveBeenCalled();

    await React.act(async () => {
      document.querySelectorAll<HTMLButtonElement>("button")[2]?.click();
      await Promise.resolve();
    });
    expect(state?.dataset.ownerRecordId).toBe("resume-b");

    await React.act(async () => {
      document.querySelector<HTMLButtonElement>("button")?.click();
      await Promise.resolve();
    });
    expect(state?.dataset.open).toBe("true");
    expect(state?.dataset.ownerRecordId).toBe("resume-b");
    expect(onRequest).toHaveBeenCalledWith("resume-b");

    React.act(() => root.unmount());
    container.remove();
  });
});
