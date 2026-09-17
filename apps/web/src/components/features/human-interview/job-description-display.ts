/** Restore visible sections in legacy single-line JDs without changing stored content or Markdown. */
export function formatJobDescriptionForDisplay(content: string): string {
  if (content.includes("\n") || /^\s*[#>*-]/.test(content)) {
    return content;
  }
  return content
    .replaceAll(
      /(^|[ \t]+)(岗位职责|任职要求|岗位要求|加分项|我们提供)([：:]?)(?=[ \t]|$)/g,
      "$1\n\n**$2$3**\n\n",
    )
    .replaceAll(/([^\s])[ \t]+(?=[\p{Script=Han}]{2,8}[：:])/gu, "$1\n\n")
    .trim();
}
