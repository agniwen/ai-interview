import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import part1 from "../../migration/http-contracts/part-1.json";
import part2 from "../../migration/http-contracts/part-2.json";
import part3 from "../../migration/http-contracts/part-3.json";
import part4 from "../../migration/http-contracts/part-4.json";
import {
  BACKGROUND_WORKLOAD_PARITY_LEDGER,
  buildHttpParityCoverageLedger,
} from "../../migration/parity-coverage-ledger.js";
import { BACKGROUND_WORKLOAD_IMPLEMENTATION_MANIFEST } from "../../src/background-workloads/background-workload.manifest.js";

const contracts = [...part1.contracts, ...part2.contracts, ...part3.contracts, ...part4.contracts];

function evidenceClaims(evidence: string): { file: string; title?: string }[] {
  return [...evidence.matchAll(/((?:src|test)\/[\w./-]+\.test\.ts)(?:#([^;]+))?/g)].map(
    (match) => ({ file: match[1] ?? "", title: match[2]?.trim() }),
  );
}

function assertEvidenceExists(entry: { category: string; evidence: string; id: string }): void {
  const claims = evidenceClaims(entry.evidence);
  expect(claims.length, `${entry.id} must reference a test file`).toBeGreaterThan(0);
  for (const claim of claims) {
    const fileUrl = new URL(`../../${claim.file}`, import.meta.url);
    expect(existsSync(fileUrl), `${entry.id} references missing ${claim.file}`).toBe(true);
    if (entry.category !== "integration-waiver") {
      expect(claim.title, `${entry.id} must identify the exact test case`).toBeTruthy();
      expect(readFileSync(fileUrl, "utf-8"), `${entry.id} references a stale test title`).toContain(
        `it("${claim.title}"`,
      );
    }
  }
}

describe("ADR 0050 parity coverage ledger", () => {
  it("maps every one of the 334 HTTP contracts to evidence or a precise integration waiver", () => {
    const ledger = buildHttpParityCoverageLedger(contracts);
    const inventoryIds = contracts.map((contract) => contract.id);
    const ledgerIds = ledger.map((entry) => entry.id);

    expect(contracts).toHaveLength(334);
    expect(new Set(inventoryIds).size).toBe(334);
    expect(ledger).toHaveLength(334);
    expect(new Set(ledgerIds).size).toBe(334);
    expect(ledgerIds.toSorted()).toEqual(inventoryIds.toSorted());
    expect(
      ledger.every(
        (entry) =>
          entry.evidence.trim().length > 0 &&
          (entry.category !== "integration-waiver" ||
            (entry.waiverReason?.trim().length ?? 0) > 60),
      ),
    ).toBe(true);
  });

  it("does not hide specialized HTTP protocols inside a generic JSON claim", () => {
    const ledgerById = new Map(
      buildHttpParityCoverageLedger(contracts).map((entry) => [entry.id, entry]),
    );
    const specializedContracts = contracts.filter(
      (contract) =>
        contract.transport.request === "multipart" ||
        contract.transport.response.some((response) =>
          ["binary", "empty", "redirect", "stream"].includes(response),
        ),
    );

    expect(specializedContracts).toHaveLength(30);
    expect(
      specializedContracts.every((contract) => {
        const entry = ledgerById.get(contract.id);
        return (
          entry?.category === "dual-run-black-box" ||
          (entry?.category === "integration-waiver" && Boolean(entry.waiverReason))
        );
      }),
    ).toBe(true);
  });

  it("maps every one of the 23 background workload ports with no stale ledger entry", () => {
    const manifestIds = BACKGROUND_WORKLOAD_IMPLEMENTATION_MANIFEST.map((entry) => entry.adapter);
    const ledgerEntries = Object.values(BACKGROUND_WORKLOAD_PARITY_LEDGER);
    const ledgerIds = ledgerEntries.map((entry) => entry.id);

    expect(manifestIds).toHaveLength(23);
    expect(new Set(manifestIds).size).toBe(23);
    expect(ledgerEntries).toHaveLength(23);
    expect(ledgerIds.toSorted()).toEqual(manifestIds.toSorted());
    expect(
      ledgerEntries.every(
        (entry) =>
          entry.evidence.trim().length > 0 &&
          (entry.category !== "integration-waiver" ||
            (entry.waiverReason?.trim().length ?? 0) > 60),
      ),
    ).toBe(true);
  });

  it("rejects missing evidence files and stale dual-run or unit-seam test titles", () => {
    const entries = [
      ...buildHttpParityCoverageLedger(contracts),
      ...Object.values(BACKGROUND_WORKLOAD_PARITY_LEDGER),
    ];

    for (const entry of entries) {
      assertEvidenceExists(entry);
    }
  });

  it("fails closed when the inventory introduces an unclassified protocol boundary", () => {
    const [contract] = contracts;
    if (!contract) {
      throw new Error("HTTP contract inventory is empty");
    }
    expect(() =>
      buildHttpParityCoverageLedger([
        {
          ...contract,
          id: "GET /api/new-protocol",
          transport: { request: "grpc", response: ["json"] },
        },
      ]),
    ).toThrow("Unclassified HTTP request transport");
  });
});
