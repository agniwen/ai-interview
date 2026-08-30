import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import type { ArcMessage } from "@arc/db-schema/ai-message";
import type { JsonValue } from "@arc/db-schema/json";
import { chatMessage } from "@arc/db-schema/schema";
import type { Database } from "@app/server/lib/server/db";
import { legacyUiMessageToArcMessage } from "@app/server/server/agents/mastra/adapters/arc-message-adapter";
import { loadStandaloneEnv, loadWebEnv } from "../standalone/env";

interface ChatMessageMigrationLog {
  [key: string]: JsonValue | undefined;
  event: string;
}

export interface ChatMessageMigrationRow {
  content: unknown;
  id: string;
}

export interface ChatMessageConversionResult {
  error?: string;
  id: string;
  message?: ArcMessage;
}

export interface ChatMessageMigrationSummary {
  failed: number;
  scanned: number;
  updated: number;
}

function logEvent(entry: ChatMessageMigrationLog): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

function loadScriptEnv(): void {
  loadStandaloneEnv();
  loadWebEnv();
}

function parseOptionalPositiveInteger(value: string | undefined, name: string): number | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseBooleanEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function convertChatMessageRow(row: ChatMessageMigrationRow): ChatMessageConversionResult {
  try {
    return { id: row.id, message: legacyUiMessageToArcMessage(row.content) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      id: row.id,
    };
  }
}

function loadRows(database: Database, limit: number | null): Promise<ChatMessageMigrationRow[]> {
  const query = database
    .select({ content: chatMessage.content, id: chatMessage.id })
    .from(chatMessage);
  return limit ? query.limit(limit) : query;
}

export async function runChatMessageArcMigration(input: {
  database: Database;
  dryRun: boolean;
  limit?: number | null;
  log?: (entry: ChatMessageMigrationLog) => void;
}): Promise<ChatMessageMigrationSummary> {
  const log = input.log ?? logEvent;
  const rows = await loadRows(input.database, input.limit ?? null);
  const summary: ChatMessageMigrationSummary = {
    failed: 0,
    scanned: rows.length,
    updated: 0,
  };

  for (const row of rows) {
    const converted = convertChatMessageRow(row);
    if (!converted.message) {
      summary.failed += 1;
      log({ error: converted.error, event: "message_failed", messageId: row.id });
      continue;
    }

    if (!input.dryRun) {
      await input.database
        .update(chatMessage)
        .set({
          content: converted.message,
          role: converted.message.role,
          updatedAt: new Date(),
        })
        .where(eq(chatMessage.id, row.id));
      summary.updated += 1;
    }
  }

  return summary;
}

export async function migrateChatMessagesToArc(): Promise<void> {
  loadScriptEnv();
  const { closeDatabase, db } = await import("@app/server/lib/server/db");
  const dryRun = !parseBooleanEnv(process.env.CHAT_MESSAGE_ARC_APPLY);
  const limit = parseOptionalPositiveInteger(
    process.env.CHAT_MESSAGE_ARC_LIMIT,
    "CHAT_MESSAGE_ARC_LIMIT",
  );

  try {
    logEvent({ dryRun, event: "migration_started", limit });
    const summary = await runChatMessageArcMigration({ database: db, dryRun, limit });
    logEvent({ event: "migration_finished", ...summary });
  } finally {
    await closeDatabase();
  }
}

function isDirectRun(): boolean {
  const [, entry] = process.argv;
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectRun()) {
  try {
    await migrateChatMessagesToArc();
  } catch (error) {
    logEvent({
      error: error instanceof Error ? error.message : String(error),
      event: "migration_crashed",
    });
    process.exitCode = 1;
  }
}
