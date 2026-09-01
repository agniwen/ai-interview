import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { z } from "zod";

interface BaselineOperation {
  method: string;
  oldPath: string;
  oldTag: string | null;
  operationId: string;
}

const baselineDocumentSchema = z.object({
  operationCount: z.number().int().nonnegative(),
  operations: z.array(
    z.object({
      method: z.string(),
      oldPath: z.string(),
      oldTag: z.string().nullable(),
      operationId: z.string(),
    }),
  ),
});
type BaselineDocument = z.infer<typeof baselineDocumentSchema>;

const openApiDocumentSchema = z.object({
  paths: z.record(
    z.string(),
    z.record(
      z.string(),
      z
        .object({ operationId: z.string().optional(), tags: z.array(z.string()).optional() })
        .loose(),
    ),
  ),
});
type OpenApiDocument = z.infer<typeof openApiDocumentSchema>;

interface ControllerLocation {
  controller: string;
  file: string;
}

interface CurrentOperation extends ControllerLocation {
  method: string;
  newPath: string;
  newTag: string | null;
  operationId: string;
}

const HTTP_METHODS = new Set(["delete", "get", "head", "options", "patch", "post", "put"]);
const backendRoot = resolve(import.meta.dirname, "..");
const sourceRoot = join(backendRoot, "src");
const baselinePath = join(import.meta.dirname, "http-route-baseline.json");
const openApiPath = join(backendRoot, "openapi.json");
const outputPath = join(import.meta.dirname, "http-route-migration.md");

async function controllerFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return controllerFiles(path);
      }
      return entry.name.endsWith(".controller.ts") ? [path] : [];
    }),
  );
  return files.flat();
}

async function operationControllerIndex(): Promise<Map<string, ControllerLocation>> {
  const index = new Map<string, ControllerLocation>();
  for (const file of await controllerFiles(sourceRoot)) {
    const source = await readFile(file, "utf-8");
    let controller = "";
    for (const line of source.split("\n")) {
      const classMatch = line.match(/export class (\w+Controller)\b/u);
      if (classMatch?.[1]) {
        [, controller] = classMatch;
      }
      const operationMatch = line.match(/operationId:\s*"([^"]+)"/u);
      if (operationMatch?.[1]) {
        if (!controller) {
          throw new Error(`Cannot identify the controller for ${operationMatch[1]} in ${file}`);
        }
        index.set(operationMatch[1], {
          controller,
          file: relative(backendRoot, file),
        });
      }
    }
  }
  return index;
}

function currentOperations(
  document: OpenApiDocument,
  controllers: Map<string, ControllerLocation>,
): CurrentOperation[] {
  const operations: CurrentOperation[] = [];
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!(HTTP_METHODS.has(method) && operation.operationId)) {
        continue;
      }
      const location = controllers.get(operation.operationId);
      if (!location) {
        throw new Error(`Cannot find the source controller for ${operation.operationId}`);
      }
      operations.push({
        ...location,
        method: method.toUpperCase(),
        newPath: path,
        newTag: operation.tags?.[0] ?? null,
        operationId: operation.operationId,
      });
    }
  }
  return operations;
}

function ownerForPath(path: string): string {
  if (path.startsWith("/workspaces/{workspaceSlug}/access")) {
    return "Identity Access";
  }
  if (path.startsWith("/workspaces/{workspaceSlug}/setup")) {
    return "Recruiting Setup";
  }
  if (path.startsWith("/workspaces/{workspaceSlug}/jobs")) {
    return "Jobs";
  }
  if (path.startsWith("/workspaces/{workspaceSlug}/candidates")) {
    return "Candidate Lifecycle";
  }
  if (path.startsWith("/workspaces/{workspaceSlug}/meetings")) {
    return "Meetings";
  }
  if (path.startsWith("/workspaces/{workspaceSlug}/copilot")) {
    return "Recruiting Copilot";
  }
  if (path.startsWith("/public/workspace-invites")) {
    return "Identity Access";
  }
  if (path.startsWith("/public/minimax-voice-previews")) {
    return "Recruiting Setup";
  }
  if (path.startsWith("/public/")) {
    return "Candidate Lifecycle";
  }
  if (path.startsWith("/system/platform")) {
    return "Platform Operations";
  }
  if (path.startsWith("/system/recovery/meetings")) {
    return "Meetings";
  }
  if (path.startsWith("/system/agents") || path.startsWith("/system/integrations/livekit")) {
    return "Candidate Lifecycle";
  }
  if (path.startsWith("/system/background")) {
    return "Background";
  }
  if (path.startsWith("/system/health")) {
    return "System Health";
  }
  throw new Error(`The route does not match the backend route grammar: ${path}`);
}

function markdownCell(value: string): string {
  return `\`${value.replaceAll("|", "\\|")}\``;
}

function compareOperationSets(
  baseline: BaselineDocument,
  current: CurrentOperation[],
): (BaselineOperation & CurrentOperation)[] {
  const currentById = new Map(current.map((operation) => [operation.operationId, operation]));
  const baselineIds = new Set(baseline.operations.map((operation) => operation.operationId));
  const missing = baseline.operations.filter(
    (operation) => !currentById.has(operation.operationId),
  );
  const extra = current.filter((operation) => !baselineIds.has(operation.operationId));
  if (missing.length || extra.length) {
    throw new Error(
      `Route migration is incomplete: missing=${missing.map((item) => item.operationId).join(",")}; extra=${extra.map((item) => item.operationId).join(",")}`,
    );
  }
  return baseline.operations.map((oldOperation) => {
    const newOperation = currentById.get(oldOperation.operationId);
    if (!newOperation) {
      throw new Error(`Missing current operation ${oldOperation.operationId}`);
    }
    if (oldOperation.method !== newOperation.method) {
      throw new Error(
        `${oldOperation.operationId} changed method from ${oldOperation.method} to ${newOperation.method}`,
      );
    }
    return { ...oldOperation, ...newOperation };
  });
}

function renderMarkdown(operations: (BaselineOperation & CurrentOperation)[]): string {
  const changed = operations.filter(
    (operation) => operation.oldPath !== operation.newPath || operation.oldTag !== operation.newTag,
  );
  const lines = [
    "# Backend HTTP Route Migration",
    "",
    "> Breaking change: the Nest backend no longer exposes the legacy `/api` route tree. Old paths are not retained as aliases.",
    "",
    "## Route grammar",
    "",
    "- Workspace member routes: `/workspaces/:workspaceSlug/{access|setup|jobs|candidates|meetings|copilot}/...`",
    "- Public routes: `/public/...`",
    "- Machine and operator routes: `/system/{health|background|agents|platform|integrations|recovery|docs}/...`",
    "- Better Auth: `/public/auth/*`",
    "- Swagger UI in non-production environments: `/system/docs`",
    "",
    "Controller decorators keep their full literal base path. There is no hidden global prefix or route-constant indirection, so `rg '@Controller'` shows the effective route family. Workspace paths use the explicit `workspaceSlug` parameter. HTTP methods, request/response contracts, Nest error envelopes, and OpenAPI operation IDs remain unchanged.",
    "",
    "## Frontend migration rules",
    "",
    "1. Prefer regenerating the Hey API client from `apps/backend/openapi.json`; operation IDs remain stable.",
    "2. Rename generated path arguments from `slug` to `workspaceSlug`.",
    "3. Manually migrate plain `fetch` calls for multipart uploads, streams, PDFs, recordings, and Better Auth.",
    "4. Update OAuth callbacks, reverse proxies, probes, monitoring, and LiveKit webhook configuration.",
    "5. Do not add compatibility aliases: an old path should return 404 so missed callers are visible.",
    "",
    "## Non-OpenAPI routes",
    "",
    "| Purpose | Old path | New path |",
    "| --- | --- | --- |",
    "| Better Auth | `/api/auth/*` | `/public/auth/*` |",
    "| Swagger UI | `/api/docs` | `/system/docs` |",
    "",
    `## OpenAPI operation mapping (${changed.length}/${operations.length} changed)`,
    "",
    "| Owner | Method | Old path | New path | operationId | Controller | Source |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  const sorted = operations.toSorted((left, right) => {
    const ownerOrder = ownerForPath(left.newPath).localeCompare(ownerForPath(right.newPath));
    return (
      ownerOrder ||
      left.newPath.localeCompare(right.newPath) ||
      left.method.localeCompare(right.method)
    );
  });
  for (const operation of sorted) {
    lines.push(
      `| ${ownerForPath(operation.newPath)} | ${operation.method} | ${markdownCell(operation.oldPath)} | ${markdownCell(operation.newPath)} | ${markdownCell(operation.operationId)} | ${markdownCell(operation.controller)} | ${markdownCell(operation.file)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

const baseline = baselineDocumentSchema.parse(JSON.parse(await readFile(baselinePath, "utf-8")));
const openApi = openApiDocumentSchema.parse(JSON.parse(await readFile(openApiPath, "utf-8")));
const controllers = await operationControllerIndex();
const operations = compareOperationSets(baseline, currentOperations(openApi, controllers));
if (operations.length !== baseline.operationCount) {
  throw new Error(`Expected ${baseline.operationCount} operations, received ${operations.length}`);
}
if (operations.some((operation) => operation.newPath.startsWith("/api/"))) {
  throw new Error("The generated OpenAPI document still contains legacy /api routes");
}
await writeFile(outputPath, renderMarkdown(operations));
console.log(`Wrote ${relative(process.cwd(), outputPath)} with ${operations.length} operations.`);
