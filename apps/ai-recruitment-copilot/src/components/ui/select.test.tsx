// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Select", () => {
  it("renders the selected item label instead of the raw value", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Select value="smtp">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="imap">IMAP 邮箱</SelectItem>
              <SelectItem value="smtp">SMTP 邮箱</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("SMTP 邮箱");
    expect(container.textContent).not.toContain("smtp");

    act(() => {
      root.unmount();
    });
  });

  it("uses the primary label from complex option content like voice selectors", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Select value="female-voice-1">
          <SelectTrigger>
            <SelectValue placeholder="选择音色" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="female-voice-1">
              <div className="flex flex-col">
                <span>温柔女声</span>
                <span className="text-muted-foreground text-xs">适合标准面试场景</span>
              </div>
            </SelectItem>
            <SelectItem value="male-voice-1">
              <div className="flex flex-col">
                <span>沉稳男声</span>
                <span className="text-muted-foreground text-xs">适合技术深挖场景</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("温柔女声");
    expect(container.textContent).not.toContain("female-voice-1");
    expect(container.textContent).not.toContain("适合标准面试场景");

    act(() => {
      root.unmount();
    });
  });
});
