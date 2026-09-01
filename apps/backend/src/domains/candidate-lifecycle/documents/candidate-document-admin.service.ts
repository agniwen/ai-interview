import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNotNull, ne, or } from "drizzle-orm";
import { chatAttachment } from "@arc/db-schema/schema";
import { API_DATABASE } from "../../../infrastructure/database/database.tokens.js";
import type { Database } from "../../../infrastructure/database/database.tokens.js";
import type {
  CandidateDocumentAdminCommands,
  CandidateDocumentAdminResult,
} from "./candidate-document-admin.commands.js";

@Injectable()
export class CandidateDocumentAdminService implements CandidateDocumentAdminCommands {
  constructor(@Inject(API_DATABASE) private readonly database: Database) {}

  async resetResumeParseCache(hash: string): Promise<CandidateDocumentAdminResult> {
    const rows = await this.database
      .update(chatAttachment)
      .set({
        parsedAt: null,
        parsedError: null,
        parsedPageCount: null,
        parsedStatus: "failed",
        parsedStructured: null,
        parsedText: null,
        parsedTextSource: null,
      })
      .where(
        and(
          eq(chatAttachment.contentHash, hash),
          or(
            ne(chatAttachment.parsedStatus, "failed"),
            isNotNull(chatAttachment.parsedStructured),
            isNotNull(chatAttachment.parsedText),
          ),
        ),
      )
      .returning({ id: chatAttachment.id });
    return rows.length > 0
      ? { ok: true, value: { clearedCount: rows.length } }
      : { error: { code: "RESUME_PARSE_CACHE_NOT_FOUND" }, ok: false };
  }
}
