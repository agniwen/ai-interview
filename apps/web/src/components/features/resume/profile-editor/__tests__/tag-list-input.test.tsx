// @vitest-environment jsdom

import { act, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { enableReactActEnvironment, renderInAct, unmountInAct } from "@/test-utils/react-act";
import { TagListInput } from "../tag-list-input";

enableReactActEnvironment();

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
  document.body.innerHTML = "";
});

function Harness({ initial }: { initial: string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <TagListInput aria-describedby="tags" id="tags-input" onChange={setValue} value={value} />
      <output data-testid="value">{value.join("|")}</output>
    </>
  );
}

async function setup(initial: string[] = []) {
  const { container, root } = await renderInAct(<Harness initial={initial} />);
  roots.push(root);
  const input = container.querySelector<HTMLInputElement>("#tags-input");
  if (!input) {
    throw new Error("missing input");
  }
  const read = (): string[] =>
    (container.querySelector("[data-testid=value]")?.textContent ?? "").split("|").filter(Boolean);
  return { container, input, read };
}

function type(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(input: HTMLInputElement, key: string) {
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
  });
}

describe("TagListInput", () => {
  it("adds a tag on Enter and ignores case-insensitive duplicates", async () => {
    const { input, read } = await setup(["Go"]);

    type(input, "Kafka");
    press(input, "Enter");
    type(input, "go");
    press(input, "Enter");

    expect(read()).toEqual(["Go", "Kafka"]);
    expect(input.value).toBe("");
  });

  it("splits pasted text on Chinese and English separators", async () => {
    const { input, read } = await setup();

    act(() => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.assign(event, { clipboardData: { getData: () => "React，TypeScript、Node.js\nGo" } });
      input.dispatchEvent(event);
    });

    expect(read()).toEqual(["React", "TypeScript", "Node.js", "Go"]);
  });

  it("removes the last tag with Backspace on an empty input", async () => {
    const { input, read } = await setup(["Go", "Rust"]);

    press(input, "Backspace");

    expect(read()).toEqual(["Go"]);
  });

  it("pulls a clicked tag back into the input for correction", async () => {
    const { container, input, read } = await setup(["Golang", "Rust"]);
    const tagButton = container.querySelector<HTMLButtonElement>(
      'button[title="点击修改「Golang」"]',
    );

    act(() => {
      tagButton?.click();
    });

    expect(read()).toEqual(["Rust"]);
    expect(input.value).toBe("Golang");
  });

  it("exposes an accessible remove button for each tag", async () => {
    const { container, read } = await setup(["Go", "Rust"]);
    const removeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="移除「Go」"]',
    );

    act(() => {
      removeButton?.click();
    });

    expect(read()).toEqual(["Rust"]);
  });
});
