export type ResolvedTheme = "dark" | "light";

const THEME_COOKIE_NAME = "theme";
const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export async function writeThemeCookie(theme: ResolvedTheme): Promise<void> {
  try {
    await cookieStore.set({
      expires: Date.now() + THEME_COOKIE_MAX_AGE_SECONDS * 1000,
      name: THEME_COOKIE_NAME,
      path: "/",
      sameSite: "lax",
      value: theme,
    });
  } catch {
    // next-themes remains the source of truth when Cookie Store is unavailable.
  }
}
