// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useIsMobile } from "./use-mobile";

// SAFETY: React test environment flag for act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ label }: { label: string }) {
  const mobile = useIsMobile();
  return (
    <span>
      {label}:{mobile ? "mobile" : "desktop"}
    </span>
  );
}

it("shares one stable breakpoint listener and cleans it up after the last consumer", () => {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const matchMedia = vi.fn(() => ({ addEventListener, removeEventListener }));
  vi.stubGlobal("matchMedia", matchMedia);
  vi.stubGlobal("innerWidth", 1024);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() =>
      root.render(
        <>
          <Probe label="first" />
          <Probe label="second" />
        </>,
      ),
    );
    expect(matchMedia).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("first:desktopsecond:desktop");
    act(() =>
      root.render(
        <>
          <Probe label="updated" />
          <Probe label="second" />
        </>,
      ),
    );
    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(removeEventListener).not.toHaveBeenCalled();
    act(() => {
      vi.stubGlobal("innerWidth", 437);
      addEventListener.mock.calls[0]?.[1]();
    });
    expect(container.textContent).toBe("updated:mobilesecond:mobile");
    act(() => root.render(<Probe label="remaining" />));
    expect(removeEventListener).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
  expect(removeEventListener).toHaveBeenCalledTimes(1);
});
