import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { OpenAPIObject } from "@nestjs/swagger";
import {
  countExpectedHttpContractOperations,
  findHttpContractParityIssues,
} from "./http-contract-parity.js";
import type { HttpContractInventoryEntry } from "./http-contract-parity.js";

interface InventoryShard {
  contracts: HttpContractInventoryEntry[];
}

const root = process.cwd();
const entries: HttpContractInventoryEntry[] = [];
for (let shard = 1; shard <= 4; shard += 1) {
  // SAFETY: migration inventory shards are repository-owned files matching InventoryShard.
  const value = JSON.parse(
    await readFile(resolve(root, `migration/http-contracts/part-${shard}.json`), "utf-8"),
  ) as InventoryShard;
  entries.push(...value.contracts);
}

// SAFETY: openapi.json is generated immediately beforehand by the typed Nest Swagger generator.
const document = JSON.parse(
  await readFile(resolve(root, "openapi.json"), "utf-8"),
) as OpenAPIObject;
const issues = findHttpContractParityIssues(entries, document, [
  "GET /api/health",
  "GET /api/ready",
]);
const expected = countExpectedHttpContractOperations(entries);

console.info(
  JSON.stringify(
    {
      actual: expected - issues.missing.length + issues.extra.length,
      expected,
      ...issues,
    },
    null,
    2,
  ),
);

if (issues.missing.length > 0 || issues.extra.length > 0) {
  process.exitCode = 1;
}
