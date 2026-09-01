import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ReferenceObject, ResponseObject, SchemaObject } from "@nestjs/swagger";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { findOperationIdIssues } from "../../migration/openapi-operation-ids.js";
import { routeSpecificityCases } from "../../migration/route-specificity-cases.js";
import type { BackendTestHarness } from "./backend-test-harness.js";
import { createBackendTestHarness } from "./backend-test-harness.js";

let backend: BackendTestHarness;

function isUnrestrictedJsonSchema(schema: ReferenceObject | SchemaObject | undefined): boolean {
  if (!schema || "$ref" in schema) {
    return false;
  }
  const { anyOf } = schema;
  if (!Array.isArray(anyOf)) {
    return false;
  }
  const variants = JSON.stringify(anyOf);
  return (
    ["string", "number", "boolean", "array", "object"].every((type) =>
      variants.includes(`"type":"${type}"`),
    ) && variants.includes('"$ref":"#"')
  );
}

function hasMeaningfulTopLevelStructure(
  schema: ReferenceObject | SchemaObject | undefined,
): boolean {
  if (!schema) {
    return false;
  }
  if ("$ref" in schema) {
    return true;
  }
  const { anyOf, oneOf, type } = schema;
  const variants = anyOf ?? oneOf;
  if (variants) {
    return variants.length > 0 && variants.every(hasMeaningfulTopLevelStructure);
  }
  if (type === "object") {
    return Object.keys(schema.properties ?? {}).length > 0;
  }
  if (type === "array") {
    return hasMeaningfulTopLevelStructure(schema.items);
  }
  return ["boolean", "integer", "number", "string"].includes(String(type));
}

function isEmptyPassthroughObjectSchema(
  schema: ReferenceObject | SchemaObject | undefined,
): boolean {
  return Boolean(
    schema &&
    !("$ref" in schema) &&
    schema.type === "object" &&
    Object.keys(schema.properties ?? {}).length === 0 &&
    schema.additionalProperties,
  );
}

function isBinaryFileProperty(property: ReferenceObject | SchemaObject | undefined): boolean {
  return Boolean(
    property &&
    "$ref" in property === false &&
    property.type === "string" &&
    property.format === "binary",
  );
}

const MULTIPART_FILE_FIELDS = new Map([
  ["POST /public/referrals/{token}/resumes", { fileField: "resume", formField: null }],
  [
    "POST /workspaces/{workspaceSlug}/candidates/recruiting-records",
    { fileField: "resume", formField: "candidateName" },
  ],
  [
    "POST /workspaces/{workspaceSlug}/candidates/intake/resume-pool",
    { fileField: "resume", formField: "scope" },
  ],
  [
    "POST /workspaces/{workspaceSlug}/candidates/resumes",
    { fileField: "resume", formField: "candidateName" },
  ],
  [
    "PATCH /workspaces/{workspaceSlug}/candidates/resumes/{id}",
    { fileField: null, formField: "candidateName" },
  ],
  [
    "POST /workspaces/{workspaceSlug}/candidates/intake/upload-batches/uploads",
    { fileField: "file", formField: null },
  ],
  ["POST /workspaces/{workspaceSlug}/copilot/uploads", { fileField: "file", formField: null }],
  [
    "POST /workspaces/{workspaceSlug}/copilot/interview-tools/parse-resume",
    { fileField: "resume", formField: null },
  ],
] as const);

beforeAll(async () => {
  backend = await createBackendTestHarness({ backgroundWorkersEnabled: false });
}, 30_000);

afterAll(async () => {
  await backend?.close();
}, 30_000);

describe("OpenAPI operation IDs", () => {
  it("rejects missing and duplicate operation IDs deterministically", () => {
    const issues = findOperationIdIssues({
      paths: {
        "/api/first": {
          get: { operationId: "readThing" },
          post: {},
        },
        "/api/second": {
          get: { operationId: "readThing" },
        },
      },
    });

    expect(issues).toEqual([
      {
        kind: "missing-operation-id",
        method: "POST",
        path: "/api/first",
      },
      {
        kind: "duplicate-operation-id",
        locations: ["GET /api/first", "GET /api/second"],
        operationId: "readThing",
      },
    ]);
  });

  it("gives every generated operation one unique explicit ID", async () => {
    const { createBackendOpenApiDocument } = await import("../../src/bootstrap.js");
    const document = createBackendOpenApiDocument(backend.app);

    expect(findOperationIdIssues(document)).toEqual([]);
  });

  it("publishes useful structured schemas for top-level JSON responses", async () => {
    const { createBackendOpenApiDocument } = await import("../../src/bootstrap.js");
    const document = createBackendOpenApiDocument(backend.app);
    const topLevelPath = /^\/(?:public|system|workspaces)(?:\/|$)/u;
    const unstructured: string[] = [];

    for (const [path, pathItem] of Object.entries(document.paths)) {
      if (!(topLevelPath.test(path) && pathItem)) {
        continue;
      }
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!(operation && "responses" in operation)) {
          continue;
        }
        const response = operation.responses["200"] ?? operation.responses["201"];
        if (!(response && "content" in response)) {
          continue;
        }
        const jsonResponse = response.content?.["application/json"];
        if (!jsonResponse) {
          continue;
        }
        const { schema } = jsonResponse;
        if (!hasMeaningfulTopLevelStructure(schema)) {
          unstructured.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }

    expect(unstructured).toEqual([]);
  });

  it("does not publish an unrestricted JSON value as an operation response", async () => {
    const { createBackendOpenApiDocument } = await import("../../src/bootstrap.js");
    const document = createBackendOpenApiDocument(backend.app);
    const unrestricted: string[] = [];

    for (const [path, pathItem] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(pathItem ?? {})) {
        if (!(operation && "responses" in operation)) {
          continue;
        }
        // SAFETY: the operation guard proves this is an OpenAPI operation with response entries.
        const responses = operation.responses as Record<string, ReferenceObject | ResponseObject>;
        for (const [status, response] of Object.entries(responses)) {
          if ("$ref" in response) {
            continue;
          }
          const schema = response.content?.["application/json"]?.schema;
          if (isUnrestrictedJsonSchema(schema)) {
            unrestricted.push(`${method.toUpperCase()} ${path} ${status}`);
          }
        }
      }
    }

    expect(unrestricted).toEqual([]);
  });

  it("publishes explicit fields instead of empty passthrough JSON responses", async () => {
    const { createBackendOpenApiDocument } = await import("../../src/bootstrap.js");
    const document = createBackendOpenApiDocument(backend.app);
    const emptyResponses: string[] = [];

    for (const [path, pathItem] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(pathItem ?? {})) {
        if (!(operation && "responses" in operation)) {
          continue;
        }
        // SAFETY: the `responses in operation` guard narrows this path-item entry to an operation.
        const responses = operation.responses as Record<string, ReferenceObject | ResponseObject>;
        for (const [status, response] of Object.entries(responses)) {
          if ("$ref" in response) {
            continue;
          }
          const schema = response.content?.["application/json"]?.schema;
          if (/^2\d\d$/u.test(status) && isEmptyPassthroughObjectSchema(schema)) {
            emptyResponses.push(`${method.toUpperCase()} ${path} ${status}`);
          }
        }
      }
    }

    expect(emptyResponses).toEqual([]);
  });

  it("describes every multipart body and upload file for HeyAPI", async () => {
    const { createBackendOpenApiDocument } = await import("../../src/bootstrap.js");
    const document = createBackendOpenApiDocument(backend.app);
    const invalid: string[] = [];

    for (const [contract, { fileField, formField }] of MULTIPART_FILE_FIELDS) {
      const separator = contract.indexOf(" ");
      const method = contract.slice(0, separator).toLowerCase();
      const path = contract.slice(separator + 1);
      const pathItem = document.paths[path];
      // SAFETY: the fixed migration contract map contains only OpenAPI HTTP operation keys.
      const operation = pathItem?.[method as "patch" | "post"];
      if (!operation) {
        invalid.push(contract);
        continue;
      }
      const { requestBody } = operation;
      if (!requestBody || "$ref" in requestBody) {
        invalid.push(contract);
        continue;
      }
      const schema = requestBody.content?.["multipart/form-data"]?.schema;
      if (!schema || "$ref" in schema) {
        invalid.push(contract);
        continue;
      }
      const property = fileField ? schema.properties?.[fileField] : undefined;
      const formProperty = formField ? schema.properties?.[formField] : undefined;
      if ((fileField && !isBinaryFileProperty(property)) || (formField && !formProperty)) {
        invalid.push(contract);
      }
    }

    expect(invalid).toEqual([]);
  });
});

describe("route migration guards", () => {
  it("preserves every pre-migration operation ID and HTTP method", async () => {
    const baselineSchema = z.object({
      operationCount: z.number().int().nonnegative(),
      operations: z.array(z.object({ method: z.string(), operationId: z.string() })),
    });
    const baseline = baselineSchema.parse(
      JSON.parse(
        await readFile(resolve(process.cwd(), "migration/http-route-baseline.json"), "utf-8"),
      ),
    );
    const { createBackendOpenApiDocument } = await import("../../src/bootstrap.js");
    const document = createBackendOpenApiDocument(backend.app);
    const current = Object.values(document.paths)
      .flatMap((pathItem) =>
        Object.entries(pathItem ?? {}).flatMap(([method, operation]) =>
          operation && "operationId" in operation && operation.operationId
            ? [{ method: method.toUpperCase(), operationId: operation.operationId }]
            : [],
        ),
      )
      .toSorted((left, right) => left.operationId.localeCompare(right.operationId));
    const expected = baseline.operations.toSorted((left, right) =>
      left.operationId.localeCompare(right.operationId),
    );

    expect(current).toHaveLength(baseline.operationCount);
    expect(current).toEqual(expected);
    expect(Object.keys(document.paths).some((path) => /^\/(?:api|w)(?:\/|$)/u.test(path))).toBe(
      false,
    );
    expect(Object.keys(document.paths).some((path) => path.includes("/studio/"))).toBe(false);
  });

  it("declares exactly the required parameters present in every path template", async () => {
    const { createBackendOpenApiDocument } = await import("../../src/bootstrap.js");
    const document = createBackendOpenApiDocument(backend.app);
    const methods = new Set(["delete", "get", "head", "options", "patch", "post", "put"]);
    const issues: string[] = [];

    for (const [path, pathItem] of Object.entries(document.paths)) {
      if (!pathItem) {
        continue;
      }
      const expected = [...path.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1]).toSorted();
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!(methods.has(method) && operation && "responses" in operation)) {
          continue;
        }
        const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
        const unresolvedReferences = parameters.filter((parameter) => "$ref" in parameter);
        const pathParameters = parameters.filter(
          (parameter) => !("$ref" in parameter) && parameter.in === "path",
        );
        const actual = pathParameters
          .map((parameter) => ("$ref" in parameter ? "" : parameter.name))
          .toSorted();
        const optional = pathParameters.flatMap((parameter) =>
          "$ref" in parameter || parameter.required ? [] : [parameter.name],
        );

        if (
          unresolvedReferences.length > 0 ||
          JSON.stringify(actual) !== JSON.stringify(expected) ||
          optional.length > 0
        ) {
          issues.push(
            `${method.toUpperCase()} ${path}: expected [${expected.join(", ")}], declared [${actual.join(", ")}], optional [${optional.join(", ")}]`,
          );
        }
      }
    }

    expect(issues).toEqual([]);
  });

  it("tracks a real static/parameterized production pair for the HTTP specificity test", () => {
    expect(routeSpecificityCases).toContainEqual({
      parameterizedPath: "/workspaces/:workspaceSlug/setup/departments/:id",
      staticPath: "/workspaces/:workspaceSlug/setup/departments/all",
    });
  });

  it("publishes serialized success bodies and the Nest error envelope for HeyAPI", async () => {
    const isolatedBackend = await createBackendTestHarness({ backgroundWorkersEnabled: false });
    try {
      const { createBackendOpenApiDocument } = await import("../../src/bootstrap.js");
      const document = createBackendOpenApiDocument(isolatedBackend.app);
      expect(document.paths["/system/health/backend/live"]?.get?.responses["200"]).toMatchObject({
        content: {
          "application/json": {
            schema: {
              properties: { ok: { type: "boolean" } },
              required: ["ok"],
              type: "object",
            },
          },
        },
      });
      expect(document.paths["/system/health/backend/live"]?.get?.responses.default).toMatchObject({
        content: {
          "application/json": {
            schema: {
              properties: {
                errorCode: { type: "string" },
                statusCode: { type: "integer" },
              },
            },
          },
        },
      });
    } finally {
      await isolatedBackend.close();
    }
  });

  it("describes every non-empty success response for HeyAPI", async () => {
    const { createBackendOpenApiDocument } = await import("../../src/bootstrap.js");
    const document = createBackendOpenApiDocument(backend.app);
    const missing: string[] = [];
    const methods = new Set(["delete", "get", "patch", "post", "put"]);

    for (const [path, pathItem] of Object.entries(document.paths)) {
      if (!pathItem) {
        continue;
      }
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!(methods.has(method) && operation && "responses" in operation)) {
          continue;
        }
        // SAFETY: the operation guard proves this is an OpenAPI operation with response entries.
        const responses = operation.responses as Record<
          string,
          { $ref?: string; content?: Record<string, { schema?: unknown }> }
        >;
        for (const [status, response] of Object.entries(responses)) {
          if (!/^2\d\d$/u.test(status) || status === "204" || response.$ref) {
            continue;
          }
          const schemas = Object.values(response.content ?? {}).flatMap((media) =>
            media?.schema ? [media.schema] : [],
          );
          if (schemas.length === 0) {
            missing.push(`${method.toUpperCase()} ${path} ${status}`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
