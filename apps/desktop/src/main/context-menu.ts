import { app, BrowserWindow, Menu } from "electron";
import type { ContextMenuParams, MenuItemConstructorOptions } from "electron";

/**
 * Native right-click edit menu, like a desktop app: cut/copy/paste/undo/redo
 * with the renderer's actual edit flags (selection, clipboard state).
 * Right-clicking non-editable UI with no selection shows no menu at all.
 */
function buildContextMenuTemplate(params: ContextMenuParams): MenuItemConstructorOptions[] {
  const { editFlags, isEditable, selectionText } = params;
  const template: MenuItemConstructorOptions[] = [];

  if (isEditable) {
    if (editFlags.canUndo) {
      template.push({ role: "undo" });
    }
    if (editFlags.canRedo) {
      template.push({ role: "redo" });
    }
    template.push(
      { type: "separator" },
      { enabled: editFlags.canCut, role: "cut" },
      { enabled: editFlags.canCopy, role: "copy" },
      { enabled: editFlags.canPaste, role: "paste" },
    );
    if (editFlags.canSelectAll) {
      template.push({ type: "separator" }, { role: "selectAll" });
    }
  } else if (selectionText.length > 0) {
    template.push({ enabled: editFlags.canCopy, role: "copy" });
  }

  return template;
}

export function registerContextMenu(): void {
  app.on("web-contents-created", (_event, contents) => {
    contents.on("context-menu", (_evt, params) => {
      const template = buildContextMenuTemplate(params);
      if (template.length === 0) {
        return;
      }
      const win = BrowserWindow.fromWebContents(contents);
      if (!win) {
        return;
      }
      Menu.buildFromTemplate(template).popup({
        frame: params.frame ?? undefined,
        window: win,
        x: params.x,
        y: params.y,
      });
    });
  });
}
