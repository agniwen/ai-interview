import type { OpenAPIObject } from "@nestjs/swagger";

const HTTP_METHODS = new Set(["delete", "get", "head", "options", "patch", "post", "put"]);
const CONTRACT_ALIASES = new Map([
  ["GET /api/w/:slug/chat/attachments/:previewId", "GET /api/w/:slug/chat/attachments/:id"],
]);

export interface HttpContractInventoryEntry {
  id: string;
  special?: string;
}

export interface HttpContractParity {
  extra: string[];
  missing: string[];
}

function canonicalContractId(id: string): string {
  return CONTRACT_ALIASES.get(id) ?? id;
}

function inventoryContractIds(entries: readonly HttpContractInventoryEntry[]): Set<string> {
  return new Set(
    entries
      .filter((entry) => entry.special !== "better-auth-handler")
      .map((entry) => canonicalContractId(entry.id)),
  );
}

function openApiContractIds(document: OpenAPIObject): Set<string> {
  const result = new Set<string>();
  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (!pathItem) {
      continue;
    }
    const contractPath = path.replaceAll(/\{([^}]+)\}/g, ":$1");
    for (const method of Object.keys(pathItem)) {
      if (HTTP_METHODS.has(method)) {
        result.add(canonicalContractId(`${method.toUpperCase()} ${contractPath}`));
      }
    }
  }
  return result;
}

export function countExpectedHttpContractOperations(
  entries: readonly HttpContractInventoryEntry[],
): number {
  return inventoryContractIds(entries).size;
}

export function findHttpContractParityIssues(
  entries: readonly HttpContractInventoryEntry[],
  document: OpenAPIObject,
  allowedAdditions: readonly string[] = [],
): HttpContractParity {
  const expected = inventoryContractIds(entries);
  const actual = openApiContractIds(document);
  const allowed = new Set(allowedAdditions);

  return {
    extra: [...actual].filter((id) => !expected.has(id) && !allowed.has(id)).toSorted(),
    missing: [...expected].filter((id) => !actual.has(id)).toSorted(),
  };
}
