const STUDIO_THEME_SELECTOR = ".mastra-studio-theme";
const STUDIO_LAYER_PREFIX = "mastra-studio-";

/**
 * The published playground stylesheet contains a compiled Tailwind theme whose
 * root selectors and utilities target the whole document. Studio portals are
 * mounted inside the theme boundary, so the entire stylesheet can be scoped to
 * that boundary without leaking generic utilities into the Platform shell.
 */
export function isolateMastraPlaygroundCss(source: string) {
  const themed = source
    .replaceAll(":root, :host", ":scope")
    .replaceAll("html, :host", ":scope")
    .replaceAll(/^([ \t]*):root \{/gm, "$1:scope {")
    .replaceAll(/^([ \t]*)html\.light \{/gm, "$1:scope.light {")
    .replaceAll(/^([ \t]*)body \{/gm, "$1:scope {");

  if (themed === source) {
    throw new Error("Mastra playground stylesheet no longer contains the expected root selectors");
  }

  const isolated = themed.replaceAll(
    /@layer\s+(properties|theme|base|components|utilities)\b/g,
    (_, layer: string) => `@layer ${STUDIO_LAYER_PREFIX}${layer}`,
  );

  return `@scope (${STUDIO_THEME_SELECTOR}) {\n${isolated}\n}`;
}

export function isMastraPlaygroundStylesheet(id: string) {
  const normalizedId = id.split("?", 1)[0]?.replaceAll("\\", "/");
  return normalizedId?.endsWith("/@mastra/playground-ui/dist/style.css") === true;
}
