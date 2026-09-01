import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { chatAttachment } from "@arc/db-schema/schema";
import { API_DATABASE } from "../../../infrastructure/database/database.tokens.js";
import type { Database } from "../../../infrastructure/database/database.tokens.js";
import type {
  CandidateDocumentCommands,
  CandidateDocumentCreateInput,
} from "./candidate-document.commands.js";

@Injectable()
export class CandidateDocumentService implements CandidateDocumentCommands {
  constructor(@Inject(API_DATABASE) private readonly database: Database) {}

  async create(input: CandidateDocumentCreateInput): Promise<void> {
    await this.database.insert(chatAttachment).values(input);
  }

  async completeParseByHash(
    input: Parameters<CandidateDocumentCommands["completeParseByHash"]>[0],
  ): Promise<void> {
    await this.database
      .update(chatAttachment)
      .set({
        parsedAt: input.parsedAt,
        parsedError: null,
        parsedPageCount: input.parsedPageCount,
        parsedStatus: "ready",
        parsedStructured: input.parsedStructured,
        parsedText: input.parsedText,
        parsedTextSource: input.parsedTextSource,
      })
      .where(eq(chatAttachment.contentHash, input.contentHash));
  }

  async storeStructuredParseByHash(
    input: Parameters<CandidateDocumentCommands["storeStructuredParseByHash"]>[0],
  ): Promise<void> {
    await this.database
      .update(chatAttachment)
      .set({ parsedStructured: input.parsedStructured })
      .where(
        and(
          eq(chatAttachment.contentHash, input.contentHash),
          eq(chatAttachment.filename, input.filename),
          isNull(chatAttachment.parsedStructured),
        ),
      );
  }
}
