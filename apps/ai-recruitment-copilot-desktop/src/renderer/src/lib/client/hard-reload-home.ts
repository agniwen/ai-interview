export const DESKTOP_HOME_HASH = "#/meetings/new";

interface ReloadableLocation {
  href: string;
  reload: () => void;
  replace: (url: string) => void;
}

/** Force-reload the renderer onto the authenticated home hash. */
export function hardReloadToHome(location: ReloadableLocation = window.location): void {
  const next = new URL(location.href);
  next.hash = DESKTOP_HOME_HASH;
  if (location.href !== next.href) {
    location.replace(next.href);
  }
  location.reload();
}
