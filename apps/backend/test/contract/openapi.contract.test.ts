import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findHttpContractParityIssues } from "../../migration/http-contract-parity.js";
import { findOperationIdIssues } from "../../migration/openapi-operation-ids.js";
import { routeSpecificityCases } from "../../migration/route-specificity-cases.js";
import type { BackendTestHarness } from "./backend-test-harness.js";
import { createBackendTestHarness } from "./backend-test-harness.js";

let backend: BackendTestHarness;

beforeAll(async () => {
  backend = await createBackendTestHarness({ backgroundWorkersEnabled: false });
});

afterAll(async () => {
  await backend?.close();
});

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
});

describe("route inventory guards", () => {
  it("matches the frozen legacy HTTP inventory exactly", async () => {
    const shards = await Promise.all(
      [1, 2, 3, 4].map(async (shard) => {
        // SAFETY: checked-in inventory shards have the documented contracts array shape.
        const value = JSON.parse(
          await readFile(
            resolve(process.cwd(), `migration/http-contracts/part-${shard}.json`),
            "utf-8",
          ),
        ) as { contracts: { id: string; special?: string }[] };
        return value.contracts;
      }),
    );
    const entries = shards.flat();
    const { createBackendOpenApiDocument } = await import("../../src/bootstrap.js");
    const document = createBackendOpenApiDocument(backend.app);

    expect(
      findHttpContractParityIssues(entries, document, ["GET /api/health", "GET /api/ready"]),
    ).toEqual({ extra: [], missing: [] });
  });

  it("tracks a real static/parameterized production pair for the HTTP specificity test", () => {
    expect(routeSpecificityCases).toContainEqual({
      parameterizedPath: "/api/w/:slug/studio/departments/:id",
      staticPath: "/api/w/:slug/studio/departments/all",
    });
  });

  it("publishes serialized success bodies and the Nest error envelope for HeyAPI", async () => {
    const isolatedBackend = await createBackendTestHarness({ backgroundWorkersEnabled: false });
    try {
      const { createBackendOpenApiDocument } = await import("../../src/bootstrap.js");
      const document = createBackendOpenApiDocument(isolatedBackend.app);
      expect(document.paths["/api/health"]?.get?.responses["200"]).toMatchObject({
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
      expect(document.paths["/api/health"]?.get?.responses.default).toMatchObject({
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
