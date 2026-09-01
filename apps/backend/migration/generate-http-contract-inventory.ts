/* oxlint-disable anti-slop/no-known-value-widening, anti-slop/require-safety-comment-for-type-assertion, array-type, complexity, curly, no-array-sort, no-nested-ternary, prefer-string-replace-all, sort-keys, text-encoding-identifier-case -- Generated migration inventory favors compact, auditable extraction logic and stable JSON field order. */
/**
 * Generates the checked-in standalone HTTP migration inventory.
 *
 * This script deliberately combines Hono's assembled runtime route table with
 * static source inspection. The runtime table is the authority for method/path;
 * source-derived schema/auth/transport metadata is advisory and carries a
 * confidence marker. Run from the repository root with Bun.
 */
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = process.cwd();
const serverRoot = resolve(root, "apps/server/src");

Object.assign(process.env, {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://inventory:inventory@127.0.0.1:1/inventory",
  ALIBABA_BASE_URL: process.env.ALIBABA_BASE_URL ?? "http://127.0.0.1",
  ALIBABA_FAST_MODEL: process.env.ALIBABA_FAST_MODEL ?? "inventory",
  ALIBABA_MODEL: process.env.ALIBABA_MODEL ?? "inventory",
  ALIBABA_STRUCTURED_MODEL: process.env.ALIBABA_STRUCTURED_MODEL ?? "inventory",
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ?? "inventory-only-secret-000000000000000000000000000000000000",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:8787",
  FEISHU_APP_ID: process.env.FEISHU_APP_ID ?? "inventory",
  FEISHU_APP_ID2: process.env.FEISHU_APP_ID2 ?? "inventory-2",
  FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET ?? "inventory",
  FEISHU_APP_SECRET2: process.env.FEISHU_APP_SECRET2 ?? "inventory-2",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "inventory",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "inventory",
  INTERVIEW_EVALUATION_MODEL: process.env.INTERVIEW_EVALUATION_MODEL ?? "inventory",
  MINIMAX_TTS_BASE_URL: process.env.MINIMAX_TTS_BASE_URL ?? "http://127.0.0.1",
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL ?? "http://127.0.0.1:3000",
  QWEN_OCR_BASE_URL: process.env.QWEN_OCR_BASE_URL ?? "http://127.0.0.1",
  QWEN_OCR_MODEL: process.env.QWEN_OCR_MODEL ?? "inventory",
  RECORDING_R2_FORCE_PATH_STYLE: process.env.RECORDING_R2_FORCE_PATH_STYLE ?? "false",
  RECORDING_R2_KEY_PREFIX: process.env.RECORDING_R2_KEY_PREFIX ?? "inventory",
  RECORDING_R2_REGION: process.env.RECORDING_R2_REGION ?? "auto",
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE ?? "false",
  S3_KEY_PREFIX: process.env.S3_KEY_PREFIX ?? "inventory",
  S3_REGION: process.env.S3_REGION ?? "auto",
});

type Method = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
type ResponseKind = "binary" | "empty" | "json" | "redirect" | "stream";

interface StaticEndpoint {
  file: string;
  line: number;
  localPath: string;
  method: Method;
  permissions: string[];
  requestKind: "json" | "multipart" | "none";
  responseKinds: ResponseKind[];
  schemas: Array<{ expression: string; location: string }>;
  statuses: number[];
  text: string;
}

function listTypeScriptFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : listTypeScriptFiles(path);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

function compact(value: string, maximum = 600): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}…`;
}

function findCallEnd(source: string, openParenthesis: number): number {
  let depth = 0;
  let quote: '"' | "'" | "`" | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openParenthesis; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    if (character === ")") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return source.length;
}

function responseKinds(text: string): ResponseKind[] {
  const kinds = new Set<ResponseKind>();
  if (/\.json\s*\(/.test(text)) kinds.add("json");
  if (/\.redirect\s*\(|\bLocation\b|status:\s*30[12378]/.test(text)) kinds.add("redirect");
  if (
    /streamSSE|streamText|streamHeaders|stream[A-Z]|ReadableStream|text\/event-stream|application\/x-ndjson/.test(
      text,
    )
  ) {
    kinds.add("stream");
  }
  if (
    /arrayBuffer|getObjectStream|Content-Disposition|application\/pdf|application\/octet-stream|audio\/|video\/|image\//.test(
      text,
    )
  ) {
    kinds.add("binary");
  }
  if (/\.body\s*\(\s*null\s*,\s*20[24]/.test(text)) kinds.add("empty");
  return kinds.size > 0 ? [...kinds].sort() : ["json"];
}

function staticEndpoints(): StaticEndpoint[] {
  const endpoints: StaticEndpoint[] = [];
  for (const absoluteFile of listTypeScriptFiles(serverRoot)) {
    const file = relative(root, absoluteFile);
    const sourceText = readFileSync(absoluteFile, "utf8");
    const filePermissions = [...sourceText.matchAll(/requirePermission\s*\(\s*([^)]*)\)/g)].map(
      (item) => compact(item[1]),
    );
    const routePattern = /\.(get|post|put|patch|delete)\s*\(\s*(?:(["'])([^"']+)\2)?/g;
    for (const match of sourceText.matchAll(routePattern)) {
      const methodName = match[1].toUpperCase() as Method;
      const localPath = match[3] ?? "/";
      const openParenthesis = sourceText.indexOf("(", match.index);
      const text = sourceText.slice(match.index, findCallEnd(sourceText, openParenthesis));
      if (!match[3] && !/(?:async\s*)?\([^)]*\)\s*=>|async\s+function/.test(text)) continue;
      const schemas: StaticEndpoint["schemas"] = [];
      for (const schemaMatch of text.matchAll(
        /zValidator\s*\(\s*(["'])(json|query|param|form)\1\s*,\s*([^,\n)]+)/g,
      )) {
        schemas.push({ expression: compact(schemaMatch[3]), location: schemaMatch[2] });
      }
      const manualSchema = text.match(
        /([A-Za-z_$][\w$]*Schema)\.safeParse\s*\(\s*await\s+c\.req\.json\s*\(/,
      );
      if (manualSchema && !schemas.some(({ expression }) => expression === manualSchema[1])) {
        schemas.push({ expression: manualSchema[1], location: "json" });
      }
      const permissions = [...text.matchAll(/requirePermission\s*\(\s*([^)]*)\)/g)].map((item) =>
        compact(item[1]),
      );
      const statusValues = [...text.matchAll(/(?:\.json|\.body)\s*\([^)]*?,\s*(\d{3})\b/gs)].map(
        (item) => Number(item[1]),
      );
      for (const statusMatch of text.matchAll(/\bstatus\s*:\s*(\d{3})\b/g)) {
        statusValues.push(Number(statusMatch[1]));
      }
      endpoints.push({
        file,
        line: sourceText.slice(0, match.index).split("\n").length,
        localPath,
        method: methodName,
        permissions: [
          ...new Set(
            permissions.length > 0
              ? permissions
              : filePermissions.length === 1
                ? filePermissions
                : [],
          ),
        ].sort(),
        requestKind: /formData\s*\(|parseBody\s*\(|["']form["']/.test(text)
          ? "multipart"
          : /req\.json\s*\(|["']json["']/.test(text)
            ? "json"
            : "none",
        responseKinds: responseKinds(text),
        schemas,
        statuses: [...new Set(statusValues)].sort((a, b) => a - b),
        text,
      });
    }
  }
  return endpoints;
}

function suffixMatches(path: string, localPath: string): boolean {
  if (localPath === "/") return true;
  const normalized = localPath.startsWith("/") ? localPath : `/${localPath}`;
  return path === normalized || path.endsWith(normalized);
}

function scoreCandidate(path: string, candidate: StaticEndpoint): number {
  let score = candidate.localPath === path ? 1000 : candidate.localPath.length;
  const routePart = candidate.file.split("/routes/").slice(1).join("/routes/");
  const directoryTokens = routePart
    .replace(/\/(?:route|collection-route|detail-route|human-route|route-runtime)\.ts$/, "")
    .split("/routes/")
    .flatMap((part) => part.split("/"))
    .filter((token) => token && !["src", "server"].includes(token));
  for (const token of directoryTokens) {
    if (path.includes(`/${token}`)) score += token.length * 4;
  }
  if (candidate.file.includes("/server/routes/platform/") && path.startsWith("/api/platform"))
    score += 100;
  if (candidate.file.includes("/server/routes/public/") && path.startsWith("/api/public"))
    score += 100;
  if (candidate.file.includes("/server/routes/studio/") && path.includes("/studio")) score += 100;
  return score;
}

function authFor(path: string, candidate: StaticEndpoint | undefined) {
  if (path.startsWith("/api/auth/")) return { level: "better-auth-native", permissions: [] };
  if (path.startsWith("/api/platform")) return { level: "platform-admin", permissions: [] };
  if (path.startsWith("/api/w/:slug")) {
    return {
      level: candidate?.permissions.length ? "workspace-permission" : "workspace-member",
      permissions: candidate?.permissions ?? [],
    };
  }
  if (path.startsWith("/api/resume") || path.startsWith("/api/meeting-local-recovery")) {
    return { level: "session", permissions: [] };
  }
  if (path.startsWith("/api/agent")) return { level: "agent-shared-secret", permissions: [] };
  if (path === "/api/livekit/webhook")
    return { level: "livekit-webhook-signature", permissions: [] };
  if (path === "/api/join/:code/accept") return { level: "session", permissions: [] };
  if (path === "/api/join/:code/preview")
    return { level: "public-optional-session", permissions: [] };
  if (path.startsWith("/api/interview")) return { level: "candidate-capability", permissions: [] };
  if (path.startsWith("/api/public")) return { level: "public-capability", permissions: [] };
  return { level: "public", permissions: [] };
}

const endpointCandidates = staticEndpoints();
const sourceOverrides: Record<string, string> = {
  "GET /api/w/:slug/meetings": "apps/server/src/server/routes/meetings/route.ts",
  "POST /api/w/:slug/meetings": "apps/server/src/server/routes/meetings/route.ts",
  "POST /api/w/:slug/meetings/:id/questions":
    "apps/server/src/server/routes/meetings/routes/questions/route.ts",
  "GET /api/w/:slug/meetings/:id/recruiting-context":
    "apps/server/src/server/routes/meetings/routes/recruiting-context/route.ts",
  "GET /api/w/:slug/meetings/:id/transcript":
    "apps/server/src/server/routes/meetings/routes/transcript/route.ts",
  "POST /api/w/:slug/meetings/:id/trash":
    "apps/server/src/server/routes/meetings/routes/trash-action/route.ts",
  "GET /api/w/:slug/studio/interviews":
    "apps/server/src/server/routes/studio/routes/interviews/route.ts",
  "POST /api/w/:slug/studio/interviews":
    "apps/server/src/server/routes/studio/routes/interviews/collection-route.ts",
  "GET /api/w/:slug/studio/interviews/summary":
    "apps/server/src/server/routes/studio/routes/interviews/route.ts",
  "POST /api/w/:slug/studio/resume-pool":
    "apps/server/src/server/routes/studio/routes/resume-pool/route.ts",
  "GET /api/w/:slug/studio/resume-upload-batches":
    "apps/server/src/server/routes/studio/routes/resume-upload-batches/route.ts",
  "GET /api/w/:slug/studio/resumes":
    "apps/server/src/server/routes/studio/routes/resumes/read-route.ts",
};
const { createServerApp } = await import("../../server/src/server/app.ts");
const runtime = createServerApp();
const runtimeRoutes = [
  ...new Map(
    runtime.routes
      .filter((route) => route.method !== "ALL")
      .map((route) => [
        `${route.method} ${route.path}`,
        { method: route.method as Method, path: route.path },
      ]),
  ).values(),
];

const serverContracts = runtimeRoutes.map(({ method, path }) => {
  const routeId = `${method} ${path}`;
  const candidates = endpointCandidates
    .filter((candidate) => candidate.method === method && suffixMatches(path, candidate.localPath))
    .sort((left, right) => scoreCandidate(path, right) - scoreCandidate(path, left));
  const overriddenFile = sourceOverrides[routeId];
  const candidate = path.startsWith("/api/auth/")
    ? undefined
    : overriddenFile
      ? candidates.find((item) => item.file === overriddenFile)
      : candidates[0];
  const topScore = candidate ? scoreCandidate(path, candidate) : 0;
  const tied =
    candidate && !overriddenFile
      ? candidates
          .filter((item) => scoreCandidate(path, item) === topScore)
          .map((item) => `${item.file}:${item.line}`)
      : [];
  const response =
    candidate?.responseKinds ?? (path.startsWith("/api/auth/") ? ["json", "redirect"] : ["json"]);
  const explicitStatuses = candidate?.statuses ?? [];
  const inferredDefaultStatus =
    Boolean(candidate) &&
    response.includes("json") &&
    !explicitStatuses.some((status) => status >= 200 && status < 300);
  const statuses = [
    ...new Set([...explicitStatuses, ...(inferredDefaultStatus ? [200] : [])]),
  ].sort((left, right) => left - right);
  return {
    id: routeId,
    method,
    path,
    source: {
      confidence: path.startsWith("/api/auth/")
        ? "exact-special"
        : overriddenFile
          ? "exact-override"
          : tied.length === 1
            ? "high"
            : "ambiguous",
      file: path.startsWith("/api/auth/")
        ? "apps/server/src/server/app.ts"
        : (candidate?.file ?? null),
      line: path.startsWith("/api/auth/") ? 67 : (candidate?.line ?? null),
      alternatives: tied.length > 1 ? tied : [],
    },
    transport: {
      request: candidate?.requestKind ?? "none",
      response,
    },
    auth: authFor(path, candidate),
    schemas: candidate?.schemas ?? [],
    statuses,
    successStatuses: statuses.filter((status) => status >= 200 && status < 400),
    statusEvidence: path.startsWith("/api/auth/")
      ? "opaque-handler"
      : inferredDefaultStatus
        ? explicitStatuses.length > 0
          ? "explicit-plus-inferred-default"
          : "inferred-default"
        : "explicit",
    special: path.startsWith("/api/auth/") ? "better-auth-handler" : null,
  };
});

const workerContracts = [
  ["GET", "/healthz", "public", "health"],
  ["GET", "/readyz", "public", "readiness"],
  ["GET", "/queues/resume-parse/stats", "worker-diagnostics-bearer", "queue-diagnostics"],
  [
    "GET",
    "/queues/resume-review-generation/stats",
    "worker-diagnostics-bearer",
    "queue-diagnostics",
  ],
  ["GET", "/operations/meetings", "worker-diagnostics-bearer", "operations-diagnostics"],
  [
    "GET",
    "/operations/interview-notifications",
    "worker-diagnostics-bearer",
    "operations-diagnostics",
  ],
].map(([method, path, level, special], index) => ({
  id: `${method} ${path}`,
  method,
  path,
  source: {
    confidence: "exact",
    file: "apps/worker/src/app.ts",
    line: [64, 66, 105, 110, 115, 131][index],
    alternatives: [],
  },
  transport: { request: "none", response: ["json"] },
  auth: { level, permissions: [] },
  schemas: [],
  statuses: special === "readiness" ? [200, 503] : [200],
  successStatuses: [200],
  statusEvidence: "explicit",
  special,
}));

const allContracts = [...serverContracts, ...workerContracts];
const summary = {
  total: allContracts.length,
  server: serverContracts.length,
  worker: workerContracts.length,
  byMethod: Object.fromEntries(
    [...new Set(allContracts.map((contract) => contract.method))]
      .sort()
      .map((method) => [
        method,
        allContracts.filter((contract) => contract.method === method).length,
      ]),
  ),
  byResponseKind: Object.fromEntries(
    ["json", "stream", "multipart", "binary", "redirect"].map((kind) => [
      kind,
      allContracts.filter(
        (contract) =>
          contract.transport.request === kind || contract.transport.response.includes(kind),
      ).length,
    ]),
  ),
  ambiguousSources: serverContracts.filter((contract) => contract.source.confidence === "ambiguous")
    .length,
  missingSources: serverContracts.filter((contract) => contract.source.file === null).length,
};

const inventory = {
  schemaVersion: 1,
  authority: {
    methodAndPath: "assembled Hono runtime route tables, deduplicated by method + path",
    metadata: "TypeScript static inspection; source.confidence identifies uncertain joins",
  },
  scope: {
    included: ["apps/server standalone HTTP", "apps/worker diagnostics HTTP"],
    excluded: [
      "Hono RPC type surface",
      "test-only routes",
      "background queue workloads without HTTP",
    ],
  },
  summary,
  contracts: allContracts,
  requiredNestAdditions: [
    {
      method: "GET",
      path: "/api/health",
      reason: "ADR 0051 Nest liveness alias; no current apps/server equivalent",
    },
    {
      method: "GET",
      path: "/api/ready",
      reason: "ADR 0051 capability-aware Nest readiness alias; no current apps/server equivalent",
    },
  ],
};

if (process.argv.includes("--missing")) {
  console.log(
    JSON.stringify(
      serverContracts.filter((contract) => contract.source.file === null).map(({ id }) => id),
      null,
      2,
    ),
  );
  process.exit(0);
}

if (process.argv.includes("--ambiguous")) {
  console.log(
    JSON.stringify(
      serverContracts
        .filter((contract) => contract.source.confidence === "ambiguous")
        .map(({ id, source }) => ({ id, alternatives: source.alternatives })),
      null,
      2,
    ),
  );
  process.exit(0);
}

const shardArgument = process.argv.find((argument) => argument.startsWith("--shard="));
if (shardArgument) {
  const [part, count] = shardArgument.slice("--shard=".length).split("/").map(Number);
  if (!(part >= 1 && count >= part)) throw new Error(`Invalid shard ${shardArgument}`);
  const shardSize = Math.ceil(allContracts.length / count);
  console.log("__INVENTORY_START__");
  console.log(
    JSON.stringify({
      schemaVersion: 1,
      shard: { part, count },
      contracts: allContracts.slice((part - 1) * shardSize, part * shardSize),
    }),
  );
  console.log("__INVENTORY_END__");
  process.exit(0);
}

console.log("__INVENTORY_START__");
console.log(JSON.stringify(inventory, null, 2));
console.log("__INVENTORY_END__");
process.exit(0);
