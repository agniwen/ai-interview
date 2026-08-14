// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RECORDING_TITLE_MAX_LENGTH } from "@arc/shared/meeting-recording";
import { MeetingDetailTitle } from "./meeting-detail-title";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MeetingDetailTitle", () => {
  it("reveals a side edit action for manageable sessions", () => {
    const html = renderToStaticMarkup(
      <MeetingDetailTitle
        canRename
        editingTitle=""
        isEditing={false}
        isPending={false}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onEdit={vi.fn()}
        onSubmit={vi.fn()}
        title="手机开箱体验"
      />,
    );

    expect(html).toContain('aria-label="编辑手机开箱体验的名称"');
    expect(html).toContain("group-hover/title:opacity-100");
  });

  it("uses a stable native underline input limited to 80 characters", () => {
    const html = renderToStaticMarkup(
      <MeetingDetailTitle
        canRename
        editingTitle="手机开箱体验"
        isEditing
        isPending={false}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onEdit={vi.fn()}
        onSubmit={vi.fn()}
        title="手机开箱体验"
      />,
    );

    expect(html).toContain("<input");
    expect(html).toContain(`maxLength="${RECORDING_TITLE_MAX_LENGTH}"`);
    expect(html).toContain("border-b");
    expect(html).toContain("[field-sizing:content]");
    expect(html).not.toContain('data-slot="input"');
    expect(html).toContain('aria-label="保存手机开箱体验的名称"');
    expect(html).toContain('aria-label="取消编辑手机开箱体验的名称"');
  });

  it("cancels only after focus leaves the whole title editor", () => {
    const container = document.createElement("div");
    const outsideButton = document.createElement("button");
    document.body.append(container, outsideButton);
    const root = createRoot(container);
    const onCancel = vi.fn();

    act(() => {
      root.render(
        <MeetingDetailTitle
          canRename
          editingTitle="手机开箱体验"
          isEditing
          isPending={false}
          onCancel={onCancel}
          onChange={vi.fn()}
          onEdit={vi.fn()}
          onSubmit={vi.fn()}
          title="手机开箱体验"
        />,
      );
    });

    const input = container.querySelector("input");
    const saveButton = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(input).not.toBeNull();
    expect(saveButton).not.toBeNull();

    act(() => input?.focus());
    act(() => saveButton?.focus());
    expect(onCancel).not.toHaveBeenCalled();

    act(() => outsideButton.focus());
    expect(onCancel).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    container.remove();
    outsideButton.remove();
  });
});
