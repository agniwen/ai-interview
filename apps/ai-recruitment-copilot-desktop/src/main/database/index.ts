import { existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import * as schema from "./schema";

function moveLegacyDatabase(databasePath: string, legacyPaths: string[]): void {
  const legacyPath = legacyPaths.find((path) => existsSync(path));
  if (existsSync(databasePath) || !legacyPath) {
    return;
  }
  const legacy = new DatabaseSync(legacyPath);
  try {
    legacy.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } finally {
    legacy.close();
  }
  renameSync(legacyPath, databasePath);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecarPath = `${legacyPath}${suffix}`;
    if (existsSync(sidecarPath)) {
      unlinkSync(sidecarPath);
    }
  }
}

/** Owns the desktop-wide SQLite connection and applies packaged migrations before feature stores run. */
export class DesktopDatabase {
  readonly client: ReturnType<typeof drizzle<typeof schema>>;
  readonly path: string;
  readonly sqlite: DatabaseSync;

  constructor(input: { legacyPaths?: string[]; migrationsFolder: string; path: string }) {
    mkdirSync(dirname(input.path), { mode: 0o700, recursive: true });
    moveLegacyDatabase(
      input.path,
      input.legacyPaths ?? [join(dirname(input.path), "sessions.sqlite")],
    );
    this.path = input.path;
    this.sqlite = new DatabaseSync(input.path);
    this.sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.client = drizzle({ client: this.sqlite, schema });
    migrate(this.client, {
      migrationsFolder: input.migrationsFolder,
      migrationsTable: "__desktop_schema_migration",
    });
  }

  close(): void {
    this.sqlite.close();
  }
}
