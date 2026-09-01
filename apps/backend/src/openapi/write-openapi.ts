import writeFileAtomic from "write-file-atomic";
import { resolve } from "node:path";
import { z } from "zod";

process.env.NODE_ENV ??= "test";
process.env.BACKGROUND_WORKERS_ENABLED ??= "false";
process.env.BETTER_AUTH_SECRET ??= "openapi-only-secret-at-least-thirty-two-characters";
process.env.BETTER_AUTH_URL ??= "http://localhost:8787";
process.env.DATABASE_URL ??= "postgres://openapi:openapi@localhost:5432/openapi";

const { createBackendApplication, createBackendOpenApiDocument } = await import("../bootstrap.js");

const application = await createBackendApplication({
  backgroundWorkersEnabled: false,
  logger: false,
});

const jsonValueSchema = z.json();
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
type JsonValue = z.infer<typeof jsonValueSchema>;

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const objectResult = jsonObjectSchema.safeParse(value);
  if (!objectResult.success) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(objectResult.data)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

try {
  const document = createBackendOpenApiDocument(application);
  const outputPath = resolve(process.cwd(), "openapi.json");
  await writeFileAtomic(
    outputPath,
    `${JSON.stringify(canonicalize(jsonValueSchema.parse(document)), null, 2)}\n`,
  );
  console.info(`OpenAPI document written to ${outputPath}`);
} finally {
  await application.close();
}
