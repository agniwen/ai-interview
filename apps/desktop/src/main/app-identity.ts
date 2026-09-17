import type { App } from "electron";
import { join } from "node:path";

export function configureAppIdentity(
  app: Pick<App, "isPackaged" | "getPath" | "setPath" | "setName">,
): void {
  // Preserve recordings and browser sessions across the product rename.
  const userDataPath = app.isPackaged
    ? join(app.getPath("appData"), "Meeting Buddy")
    : app.getPath("userData");

  app.setPath("userData", userDataPath);
  app.setPath("sessionData", userDataPath);
  app.setName("Echo");
}
