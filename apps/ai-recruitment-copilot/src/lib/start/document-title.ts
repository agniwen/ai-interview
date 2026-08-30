export const APPLICATION_NAME = "AI Hiring Copilot";
export const ROOT_DOCUMENT_TITLE = `招聘 AI 协同工作台 · ${APPLICATION_NAME}`;

export function formatDocumentTitle(pageTitle: string): string {
  const normalizedTitle = pageTitle.trim();
  const applicationSuffix = ` · ${APPLICATION_NAME}`;
  return normalizedTitle.endsWith(applicationSuffix)
    ? normalizedTitle
    : `${normalizedTitle}${applicationSuffix}`;
}

const PUBLIC_PAGE_TITLES: readonly (readonly [RegExp, string])[] = [
  [/^\/invite\//, "加入工作区"],
  [/^\/interview\/[^/]+$/, "AI 面试"],
];

function normalizePathname(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }
  return pathname.replace(/\/+$/, "");
}

function resolveWorkspaceTitle(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const [scope, workspaceSlug, area, page] = segments;
  if (scope !== "w" || !workspaceSlug) {
    return null;
  }

  if (area === "agent" || area === "chat") {
    return page ? "招聘 Copilot · 对话" : "招聘 Copilot";
  }

  if (area !== "studio") {
    return "工作区";
  }

  return page ? "Studio" : "招聘台";
}

function resolvePlatformTitle(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "platform") {
    return null;
  }

  if (segments[1] === "livekit") {
    return "平台 · LiveKit";
  }
  return "平台管理";
}

export function resolveDocumentTitle(pathname: string): string {
  const normalizedPathname = normalizePathname(pathname);
  if (normalizedPathname === "/") {
    return ROOT_DOCUMENT_TITLE;
  }

  for (const [pattern, title] of PUBLIC_PAGE_TITLES) {
    if (pattern.test(normalizedPathname)) {
      return formatDocumentTitle(title);
    }
  }

  const pageTitle =
    resolveWorkspaceTitle(normalizedPathname) ??
    resolvePlatformTitle(normalizedPathname) ??
    ROOT_DOCUMENT_TITLE;
  return formatDocumentTitle(pageTitle);
}

export function documentTitleMeta(matches: readonly { pathname: string }[]) {
  const pathname = matches.at(-1)?.pathname ?? "/";
  return [{ title: resolveDocumentTitle(pathname) }];
}
