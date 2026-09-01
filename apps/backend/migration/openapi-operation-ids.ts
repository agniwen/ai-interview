const HTTP_METHODS = ["delete", "get", "head", "options", "patch", "post", "put", "trace"] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];

interface OpenApiOperationLike {
  operationId?: string;
}

type OpenApiPathItemLike = Partial<Record<HttpMethod, OpenApiOperationLike>>;

export interface OpenApiDocumentLike {
  paths?: Record<string, OpenApiPathItemLike | undefined>;
}

export interface MissingOperationIdIssue {
  kind: "missing-operation-id";
  method: Uppercase<HttpMethod>;
  path: string;
}

export interface DuplicateOperationIdIssue {
  kind: "duplicate-operation-id";
  locations: string[];
  operationId: string;
}

export type OperationIdIssue = DuplicateOperationIdIssue | MissingOperationIdIssue;

/**
 * CI-facing OpenAPI policy used by the additive migration. It deliberately
 * accepts a small structural type so the generated document remains the
 * public boundary; the checker does not import Nest controllers or metadata.
 */
export function findOperationIdIssues(document: OpenApiDocumentLike): OperationIdIssue[] {
  const issues: OperationIdIssue[] = [];
  const locationsByOperationId = new Map<string, string[]>();

  for (const path of Object.keys(document.paths ?? {}).toSorted()) {
    const pathItem = document.paths?.[path];
    if (!pathItem) {
      continue;
    }

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) {
        continue;
      }

      const { operationId } = operation;
      const location = `${method.toUpperCase()} ${path}`;
      if (!operationId?.trim()) {
        issues.push({
          kind: "missing-operation-id",
          // SAFETY: method is drawn from the lowercase HTTP_METHODS tuple.
          method: method.toUpperCase() as Uppercase<HttpMethod>,
          path,
        });
        continue;
      }

      const normalizedOperationId = operationId.trim();
      const locations = locationsByOperationId.get(normalizedOperationId) ?? [];
      locations.push(location);
      locationsByOperationId.set(normalizedOperationId, locations);
    }
  }

  for (const [operationId, locations] of [...locationsByOperationId.entries()].toSorted(
    ([a], [b]) => a.localeCompare(b),
  )) {
    if (locations.length > 1) {
      issues.push({
        kind: "duplicate-operation-id",
        locations: locations.toSorted(),
        operationId,
      });
    }
  }

  return issues;
}
