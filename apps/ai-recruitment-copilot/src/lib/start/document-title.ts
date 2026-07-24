export const ROOT_DOCUMENT_TITLE = "招聘 AI 协同工作台 · AI Recruitment Copilot";

const PUBLIC_PAGE_TITLES: readonly (readonly [RegExp, string])[] = [
  [/^\/invite\//, "加入工作区"],
  [/^\/interview\/[^/]+$/, "AI 面试"],
];

const MASTRA_PAGE_TITLES: Readonly<Record<string, string>> = {
  agents: "Agents",
  channels: "Channels",
  chat: "Chat",
  datasets: "Datasets",
  editor: "Agent Editor",
  evaluate: "Evaluation",
  evaluation: "Evaluation",
  experiments: "Experiments",
  favorite: "Favorites",
  graph: "Workflow Graph",
  infrastructure: "Infrastructure",
  "instruction-blocks": "Instruction Blocks",
  integrations: "Integrations",
  items: "Dataset Items",
  library: "Library",
  login: "Login",
  logs: "Logs",
  mcps: "MCP Servers",
  memory: "Memory",
  metrics: "Metrics",
  observability: "Observability",
  processors: "Processors",
  prompts: "Prompts",
  "request-context": "Request Context",
  resources: "Resources",
  review: "Review",
  schedules: "Schedules",
  scorers: "Scorers",
  session: "Agent Session",
  settings: "Settings",
  signup: "Sign Up",
  skills: "Skills",
  templates: "Templates",
  tools: "Tools",
  traces: "Traces",
  variables: "Variables",
  versions: "Versions",
  workflows: "Workflows",
  workspaces: "Workspaces",
};

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

function resolveMastraAction(segments: string[]): string | null {
  if (segments.includes("create")) {
    return "Create";
  }
  if (segments.includes("edit")) {
    return "Edit";
  }
  if (segments.includes("view")) {
    return "View";
  }
  return null;
}

function resolveMastraTitle(segments: string[]): string {
  const visibleSegments = segments.filter(
    (segment) => segment !== "_main" && segment !== "_minimal",
  );
  const isAgentBuilder = visibleSegments[0] === "agent-builder";
  const semanticSegments = visibleSegments.filter(
    (segment) =>
      segment !== "agent-builder" &&
      segment !== "_edition" &&
      segment !== "_listing" &&
      !segment.endsWith("_"),
  );
  const action = resolveMastraAction(semanticSegments);

  let pageTitle: string | null = null;
  for (let index = semanticSegments.length - 1; index >= 0; index -= 1) {
    const segment = semanticSegments[index];
    if (segment && MASTRA_PAGE_TITLES[segment]) {
      pageTitle = MASTRA_PAGE_TITLES[segment];
      break;
    }
  }

  const context = isAgentBuilder ? "Agent Builder · Mastra Studio" : "Mastra Studio";
  if (!(pageTitle || action)) {
    return context;
  }
  return [action, pageTitle, context].filter(Boolean).join(" · ");
}

function resolvePlatformTitle(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "platform") {
    return null;
  }

  if (segments[1] === "mastra-studio") {
    return resolveMastraTitle(segments.slice(2));
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
      return title;
    }
  }

  return (
    resolveWorkspaceTitle(normalizedPathname) ??
    resolvePlatformTitle(normalizedPathname) ??
    ROOT_DOCUMENT_TITLE
  );
}

export function documentTitleMeta(matches: readonly { pathname: string }[]) {
  const pathname = matches.at(-1)?.pathname ?? "/";
  return [{ title: resolveDocumentTitle(pathname) }];
}
