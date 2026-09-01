import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  DATA_OWNERS,
  DOMAIN_TABLES,
  DECLARED_CROSS_OWNER_WRITES,
  sourceOwner,
  TABLE_OWNER,
} from "./data-ownership.js";

interface WriteSite {
  file: string;
  line: number;
  operation: "delete" | "insert" | "update";
  table: string;
}

interface OwnershipViolation extends WriteSite {
  sourceDomain: string;
  tableOwner: string;
}

const SOURCE_ROOT = resolve(import.meta.dirname, "..");
const SCHEMA_PATH = resolve(import.meta.dirname, "../../../../packages/db-schema/src/schema.ts");

function isWriteOperation(value: string): value is WriteSite["operation"] {
  return value === "delete" || value === "insert" || value === "update";
}

async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return typescriptFiles(path);
      }
      return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
    }),
  );
  return files.flat();
}

function tableName(expression: ts.Expression | undefined): string | undefined {
  if (!expression) {
    return undefined;
  }
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return undefined;
}

async function discoverWrites(): Promise<WriteSite[]> {
  const writes: WriteSite[] = [];
  for (const filePath of await typescriptFiles(SOURCE_ROOT)) {
    const sourceText = await readFile(filePath, "utf-8");
    const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
    const schemaBindings = new Set<string>();
    for (const statement of source.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === "@arc/db-schema/schema" &&
        statement.importClause?.namedBindings &&
        ts.isNamedImports(statement.importClause.namedBindings)
      ) {
        for (const element of statement.importClause.namedBindings.elements) {
          schemaBindings.add(element.name.text);
        }
      }
    }
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const operation = node.expression.name.text;
        const table = tableName(node.arguments[0]);
        if (
          isWriteOperation(operation) &&
          table &&
          (schemaBindings.has(table) || TABLE_OWNER[table])
        ) {
          const position = source.getLineAndCharacterOfPosition(node.getStart(source));
          writes.push({
            file: relative(SOURCE_ROOT, filePath),
            line: position.line + 1,
            operation,
            table,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return writes.toSorted((left, right) =>
    `${left.file}:${left.line}`.localeCompare(`${right.file}:${right.line}`),
  );
}

async function discoverSchemaTables(): Promise<string[]> {
  const sourceText = await readFile(SCHEMA_PATH, "utf-8");
  const source = ts.createSourceFile(SCHEMA_PATH, sourceText, ts.ScriptTarget.Latest, true);
  const tables: string[] = [];
  for (const statement of source.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      !statement.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword)
    ) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        ts.isCallExpression(declaration.initializer) &&
        ts.isIdentifier(declaration.initializer.expression) &&
        declaration.initializer.expression.text === "pgTable"
      ) {
        tables.push(declaration.name.text);
      }
    }
  }
  return tables.toSorted();
}

describe("domain data ownership", () => {
  it("assigns each persisted table to exactly one owner", () => {
    const declaredTables = DATA_OWNERS.flatMap((owner) => DOMAIN_TABLES[owner]);
    expect(new Set(declaredTables).size).toBe(declaredTables.length);
  });

  it("assigns every Drizzle schema table to an owner", async () => {
    const declaredTables = DATA_OWNERS.flatMap((owner) => DOMAIN_TABLES[owner]).toSorted();
    expect(declaredTables).toEqual(await discoverSchemaTables());
  });

  it("recognizes every table written by backend production code", async () => {
    const writes = await discoverWrites();
    const unknownTables = writes
      .filter(({ table }) => !TABLE_OWNER[table])
      .map(({ file, line, table }) => `${file}:${line} -> ${table}`);
    expect(unknownTables).toEqual([]);
  });

  it("keeps Recruiting Setup refresh helpers limited to setup-owned tables", async () => {
    const refreshHelpers = [
      "domains/recruiting-setup/forms/refresh-eligible-candidates.ts",
      "domains/recruiting-setup/question-templates/refresh-eligible-candidates.ts",
    ];
    const violations: string[] = [];
    for (const file of refreshHelpers) {
      const sourceText = await readFile(resolve(SOURCE_ROOT, file), "utf-8");
      const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
      for (const statement of source.statements) {
        if (
          !(
            ts.isImportDeclaration(statement) &&
            ts.isStringLiteral(statement.moduleSpecifier) &&
            statement.moduleSpecifier.text === "@arc/db-schema/schema" &&
            statement.importClause?.namedBindings &&
            ts.isNamedImports(statement.importClause.namedBindings)
          )
        ) {
          continue;
        }
        for (const binding of statement.importClause.namedBindings.elements) {
          const table = binding.propertyName?.text ?? binding.name.text;
          if (TABLE_OWNER[table] !== "recruiting-setup") {
            violations.push(`${file} -> ${table} (${TABLE_OWNER[table] ?? "unowned"})`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps Platform Operations free of Candidate Lifecycle writes", async () => {
    const writes = await discoverWrites();
    expect(
      writes.filter(
        ({ file, table }) =>
          file === "domains/platform-operations/http/platform-operations.service.ts" &&
          TABLE_OWNER[table] === "candidate-lifecycle",
      ),
    ).toEqual([]);
  });

  it("does not add undeclared cross-owner writes", async () => {
    const writes = await discoverWrites();
    const violations: OwnershipViolation[] = writes
      .map((write) => ({
        ...write,
        sourceDomain: sourceOwner(write.file) ?? "unclassified",
        tableOwner: TABLE_OWNER[write.table] ?? "unowned",
      }))
      .filter(({ sourceDomain, tableOwner }) => sourceDomain !== tableOwner);

    const actualBaseline = Object.entries(
      Object.groupBy(violations, ({ file, table }) => `${file} -> ${table}`),
    )
      .map(([key, sites]) => `${key} (${sites?.length ?? 0})`)
      .toSorted();
    const declaredBaseline = DECLARED_CROSS_OWNER_WRITES.map(
      ({ count, source, table }) => `${source} -> ${table} (${count})`,
    ).toSorted();

    expect(actualBaseline).toEqual(declaredBaseline);
  });

  it("keeps central background recovery as an owner-command facade", async () => {
    const source = await readFile(
      resolve(SOURCE_ROOT, "background-infrastructure/background-recovery.repository.ts"),
      "utf-8",
    );

    expect(source).not.toContain("@arc/db-schema");
    expect(source).not.toMatch(/\.(?:delete|insert|update)\s*\(/u);
    expect(source).toContain("CandidateRecoveryCommands");
    expect(source).toContain("MeetingRecoveryCommands");
  });
});
