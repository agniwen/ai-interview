import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const threadSource = readFileSync(new URL("../recruiting-thread.tsx", import.meta.url), "utf-8");

describe("recruiting message actions", () => {
  it("only shows user copy and edit actions while the message is hovered", () => {
    const userActionBar = threadSource.slice(
      threadSource.indexOf("function UserActionBar()"),
      threadSource.indexOf("function EditComposer()"),
    );

    expect(userActionBar).toContain('autohide="always"');
    expect(userActionBar).toContain("ActionBarPrimitive.Copy");
    expect(userActionBar).toContain("ActionBarPrimitive.Edit");
  });

  it("keeps the user action row height stable while actions are hidden", () => {
    expect(threadSource).toContain(
      '<div className="flex min-h-8 items-center justify-end">\n        <UserActionBar />\n      </div>',
    );
  });
});
