// @vitest-environment jsdom

import { TextMessagePartProvider } from "@assistant-ui/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { RecruitingMarkdownText } from "../recruiting-markdown-text";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderPart(text: string, isRunning: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  const nextRoot = createRoot(host);
  container = host;
  root = nextRoot;
  await act(async () => {
    nextRoot.render(
      <TextMessagePartProvider isRunning={isRunning} text={text}>
        <RecruitingMarkdownText />
      </TextMessagePartProvider>,
    );
    await Promise.resolve();
  });
  return host;
}

function caretOf(view: HTMLElement) {
  return view
    .querySelector<HTMLElement>(".streaming-markdown")
    ?.style.getPropertyValue("--streamdown-caret");
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("RecruitingMarkdownText", () => {
  it("animates streamed characters and shows a caret while the part is running", async () => {
    const view = await renderPart("候选人**匹配度高**。", true);

    expect(view.querySelectorAll("[data-sd-animate]").length).toBeGreaterThan(0);
    expect(caretOf(view)).not.toBe("");
  });

  it("renders settled markdown without animation or caret once the part completes", async () => {
    const view = await renderPart("候选人**匹配度高**。", false);

    expect(view.querySelectorAll("[data-sd-animate]")).toHaveLength(0);
    expect(caretOf(view) ?? "").toBe("");
    expect(view.querySelector("strong")?.textContent).toBe("匹配度高");
  });
});
