import { createClient } from "@hey-api/openapi-ts";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const backendDirectory = resolve(import.meta.dirname, "..");
const workspaceDirectory = resolve(backendDirectory, "../..");
const inputPath = resolve(backendDirectory, "openapi.json");
const outputPath = resolve(workspaceDirectory, "apps/web/src/lib/client/generated/backend");

const document = JSON.parse(await readFile(inputPath, "utf-8"));
/**
 * Zod's OpenAPI 3.0 output currently embeds JSON Schema `definitions` inside
 * individual response schemas. Their `#/definitions/*` pointers are local to
 * those schemas, while OpenAPI resolves pointers from the document root.
 * Inline those definitions for code generation and collapse recursive JSON
 * values to an open schema at the recursion boundary.
 */
function inlineLocalDefinitions(value, definitions, resolving = new Set()) {
  if (Array.isArray(value)) {
    return value.map((entry) => inlineLocalDefinitions(entry, definitions, resolving));
  }
  if (!(value && typeof value === "object")) {
    return value;
  }

  const reference = typeof value.$ref === "string" ? value.$ref : undefined;
  const localPrefix = "#/definitions/";
  if (reference?.startsWith(localPrefix)) {
    const name = reference.slice(localPrefix.length);
    const source = definitions?.[name];
    if (!source || resolving.has(source)) {
      return {};
    }
    const nextResolving = new Set([...resolving, source]);
    return inlineLocalDefinitions(source, definitions, nextResolving);
  }

  const nestedDefinitions =
    value.definitions && typeof value.definitions === "object" ? value.definitions : definitions;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "definitions")
      .map(([key, entry]) => [key, inlineLocalDefinitions(entry, nestedDefinitions, resolving)]),
  );
}

/**
 * Hey API's current OpenAPI 3.0 parser drops the `nullable` keyword. Convert
 * that keyword to the equivalent OpenAPI 3.1 JSON Schema union before codegen
 * so generated request and response types keep `null` where the Nest contract
 * allows it.
 */
function normalizeNullable(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeNullable);
  }
  if (!(value && typeof value === "object")) {
    return value;
  }

  const normalized = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "nullable")
      .map(([key, entry]) => [key, normalizeNullable(entry)]),
  );
  if (value.nullable !== true) {
    return normalized;
  }
  if (typeof normalized.type === "string") {
    normalized.type = [normalized.type, "null"];
    if (Array.isArray(normalized.enum) && !normalized.enum.includes(null)) {
      normalized.enum.push(null);
    }
    return normalized;
  }
  return { anyOf: [normalized, { type: "null" }] };
}

const normalizedDocument = normalizeNullable(inlineLocalDefinitions(document));
normalizedDocument.openapi = "3.1.0";

const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "arc-openapi-"));
const normalizedInputPath = resolve(temporaryDirectory, "openapi.json");

try {
  await writeFile(normalizedInputPath, JSON.stringify(normalizedDocument));
  await createClient({
    input: normalizedInputPath,
    output: {
      clean: true,
      path: outputPath,
    },
    plugins: [
      "@hey-api/typescript",
      "@hey-api/client-fetch",
      "@hey-api/sdk",
      {
        mutationKeys: true,
        mutationOptions: true,
        name: "@tanstack/react-query",
        queryKeys: { tags: true },
        queryOptions: true,
      },
    ],
  });
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}

console.info(`Hey API client written to ${outputPath}`);
