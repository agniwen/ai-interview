import type { MouseEvent } from "react";

export function focusComposerInputFromShellClick(event: MouseEvent<HTMLElement>) {
  const { target } = event;
  if (!(target instanceof Element)) {
    return;
  }
  const shell = target.closest(".aui-composer-shell");
  if (!shell) {
    return;
  }
  if (target.closest("button, [role='button'], .aui-lexical-input")) {
    return;
  }
  shell.querySelector<HTMLElement>(".aui-lexical-input")?.focus();
}
