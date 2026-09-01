import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import type { BackendEnvironmentKey } from "../../../config/backend-environment.schema.js";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import {
  department,
  interviewer,
  jobDescriptionInterviewer,
  minimaxVoicePreview,
} from "@arc/db-schema/schema";
import { minimaxVoiceSchema } from "@arc/db-schema/minimax-voices";
import { parseListTextFilters } from "@arc/shared/list-text-filters";
import { z } from "zod";
import { WORKSPACE_DATABASE_PORT } from "../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";
import type { HttpBinaryResponse } from "../../../infrastructure/http/http.ports.js";
import type {
  interviewerFormSchema,
  interviewerListQuerySchema,
  interviewerUpdateSchema,
} from "./interviewer.schemas.js";

type InterviewerInput = z.infer<typeof interviewerFormSchema>;
type InterviewerUpdate = z.infer<typeof interviewerUpdateSchema>;
type InterviewerListQuery = z.infer<typeof interviewerListQuerySchema>;
const minimaxTtsResponseSchema = z.object({
  base_resp: z
    .object({ status_code: z.number().optional(), status_msg: z.string().optional() })
    .optional(),
  data: z.object({ audio: z.string().nullable().optional() }).optional(),
});

function requiredStorageEnvironment(name: BackendEnvironmentKey) {
  const value = rawBackendEnvironment[name]?.trim();
  if (!value) {
    throw new Error(`S3 storage is not configured: ${name} is required`);
  }
  return value;
}

function serialize(
  row: Pick<
    typeof interviewer.$inferSelect,
    | "createdAt"
    | "createdBy"
    | "departmentId"
    | "description"
    | "id"
    | "name"
    | "prompt"
    | "updatedAt"
    | "voice"
  >,
) {
  return {
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    departmentId: row.departmentId,
    description: row.description,
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    updatedAt: row.updatedAt.toISOString(),
    voice: minimaxVoiceSchema.parse(row.voice),
  };
}

@Injectable()
export class InterviewerService {
  private storage?: { bucket: string; client: S3Client };
  constructor(@Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort) {}

  private getStorage() {
    this.storage ??= {
      bucket: requiredStorageEnvironment("S3_BUCKET_NAME"),
      client: new S3Client({
        credentials: {
          accessKeyId: requiredStorageEnvironment("S3_ACCESS_KEY_ID"),
          secretAccessKey: requiredStorageEnvironment("S3_SECRET_ACCESS_KEY"),
        },
        endpoint: new URL(requiredStorageEnvironment("S3_ENDPOINT")).origin,
        forcePathStyle: rawBackendEnvironment.S3_FORCE_PATH_STYLE === "true",
        region: requiredStorageEnvironment("S3_REGION"),
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      }),
    };
    return this.storage;
  }

  async publicVoicePreview(id: string): Promise<HttpBinaryResponse> {
    const [row] = await this.database
      .select({
        contentType: minimaxVoicePreview.contentType,
        storageKey: minimaxVoicePreview.storageKey,
      })
      .from(minimaxVoicePreview)
      .where(eq(minimaxVoicePreview.id, id))
      .limit(1);
    if (!row) {
      throw new NotFoundException("Voice preview not found", {
        errorCode: "VOICE_PREVIEW_NOT_FOUND",
      });
    }
    const storage = this.getStorage();
    try {
      const object = await storage.client.send(
        new GetObjectCommand({ Bucket: storage.bucket, Key: row.storageKey }),
      );
      if (!object.Body || !(object.Body instanceof Readable)) {
        throw new Error("S3 returned no stream");
      }
      const headers = {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": row.contentType,
      };
      return {
        body: object.Body,
        headers:
          object.ContentLength === undefined
            ? headers
            : { ...headers, "Content-Length": String(object.ContentLength) },
      };
    } catch (error) {
      if (error instanceof Error && ["NoSuchKey", "NotFound"].includes(error.name)) {
        throw new NotFoundException("Stored file is unavailable", {
          errorCode: "PUBLIC_FILE_NOT_FOUND",
        });
      }
      throw error;
    }
  }

  async voicePreview(voice: z.infer<typeof minimaxVoiceSchema>) {
    const previewText = "我是一名宇航员，我的故乡是地球。";
    const model = "speech-02-turbo";
    const format = "mp3";
    const previewTextHash = createHash("sha256")
      .update(previewText, "utf-8")
      .digest("hex")
      .slice(0, 32);
    const identity = and(
      eq(minimaxVoicePreview.voice, voice),
      eq(minimaxVoicePreview.previewTextHash, previewTextHash),
      eq(minimaxVoicePreview.model, model),
      eq(minimaxVoicePreview.format, format),
    );
    const cached = await this.database.select().from(minimaxVoicePreview).where(identity).limit(1);
    if (cached[0]) {
      return { cached: true, previewText, url: cached[0].publicUrl, voice };
    }
    const apiKey = rawBackendEnvironment.MINIMAX_API_KEY?.trim();
    const baseUrl = rawBackendEnvironment.MINIMAX_TTS_BASE_URL?.trim().replace(/\/+$/, "");
    if (!apiKey || !baseUrl) {
      throw new Error("MiniMax TTS is not configured.");
    }
    const response = await fetch(`${baseUrl}/v1/t2a_v2`, {
      body: JSON.stringify({
        audio_setting: { bitrate: 128_000, channel: 1, format, sample_rate: 32_000 },
        language_boost: voice.startsWith("Cantonese_") ? "Chinese,Yue" : "Chinese",
        model,
        output_format: "hex",
        stream: false,
        text: previewText,
        voice_setting: { pitch: 0, speed: 1, voice_id: voice, vol: 1 },
      }),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`MiniMax TTS request failed with status ${response.status}.`);
    }
    const payload = minimaxTtsResponseSchema.parse(await response.json());
    const audioHex = payload.data?.audio;
    if (
      payload.base_resp?.status_code !== 0 ||
      !audioHex ||
      audioHex.length % 2 ||
      !/^[\da-f]+$/i.test(audioHex)
    ) {
      throw new Error(
        payload.base_resp?.status_msg || "MiniMax TTS response did not include valid audio.",
      );
    }
    const audio = Uint8Array.from({ length: audioHex.length / 2 }, (_, index) =>
      Number.parseInt(audioHex.slice(index * 2, index * 2 + 2), 16),
    );
    const safeVoice =
      voice
        .replaceAll(/[^a-zA-Z0-9._-]+/g, "_")
        .replaceAll(/_+/g, "_")
        .replaceAll(/^_+|_+$/g, "")
        .slice(0, 160) || "voice";
    const storageKey = `voice-previews/minimax/${model}/${previewTextHash}/${safeVoice}.${format}`;
    const storage = this.getStorage();
    await storage.client.send(
      new PutObjectCommand({
        Body: audio,
        Bucket: storage.bucket,
        ContentLength: audio.byteLength,
        ContentType: "audio/mpeg",
        Key: storageKey,
      }),
    );
    const id = crypto.randomUUID();
    const publicUrl = `/public/minimax-voice-previews/${encodeURIComponent(id)}`;
    const now = new Date();
    const inserted = await this.database
      .insert(minimaxVoicePreview)
      .values({
        contentType: "audio/mpeg",
        createdAt: now,
        format,
        id,
        model,
        previewText,
        previewTextHash,
        publicUrl,
        sizeBytes: audio.byteLength,
        storageKey,
        updatedAt: now,
        voice,
      })
      .onConflictDoNothing({
        target: [
          minimaxVoicePreview.voice,
          minimaxVoicePreview.previewTextHash,
          minimaxVoicePreview.model,
          minimaxVoicePreview.format,
        ],
      })
      .returning();
    if (inserted[0]) {
      return { cached: false, previewText, url: publicUrl, voice };
    }
    const winner = await this.database.select().from(minimaxVoicePreview).where(identity).limit(1);
    if (!winner[0]) {
      throw new Error("Voice preview cache insert conflicted but no cached row was found.");
    }
    return { cached: true, previewText, url: winner[0].publicUrl, voice };
  }

  private async requireDepartment(organizationId: string, departmentId: string) {
    const rows = await this.database
      .select({ id: department.id })
      .from(department)
      .where(and(eq(department.id, departmentId), eq(department.organizationId, organizationId)))
      .limit(1);
    if (!rows[0]) {
      throw new BadRequestException("所选部门不存在。", {
        errorCode: "INTERVIEWER_DEPARTMENT_NOT_FOUND",
      });
    }
  }

  async list(organizationId: string, query: InterviewerListQuery) {
    const textFilters = parseListTextFilters(query.textFilters);
    const filters = [eq(interviewer.organizationId, organizationId)];
    if (query.search) {
      const searchFilter = or(
        ilike(interviewer.name, `%${query.search}%`),
        ilike(interviewer.description, `%${query.search}%`),
      );
      if (searchFilter) {
        filters.push(searchFilter);
      }
    }
    if (query.departmentId) {
      filters.push(eq(interviewer.departmentId, query.departmentId));
    }
    if (textFilters.name) {
      filters.push(ilike(interviewer.name, `%${textFilters.name}%`));
    }
    if (textFilters.description) {
      filters.push(ilike(interviewer.description, `%${textFilters.description}%`));
    }
    const where = and(...filters);
    let order =
      query.sortOrder === "asc" ? asc(interviewer.createdAt) : desc(interviewer.createdAt);
    if (query.sortBy === "name") {
      order = query.sortOrder === "asc" ? asc(interviewer.name) : desc(interviewer.name);
    } else if (query.sortBy === "updatedAt") {
      order = query.sortOrder === "asc" ? asc(interviewer.updatedAt) : desc(interviewer.updatedAt);
    }
    const offset = (query.page - 1) * query.pageSize;
    const [rows, totalRows] = await Promise.all([
      this.database
        .select({
          createdAt: interviewer.createdAt,
          createdBy: interviewer.createdBy,
          departmentId: interviewer.departmentId,
          departmentName: department.name,
          description: interviewer.description,
          id: interviewer.id,
          name: interviewer.name,
          prompt: interviewer.prompt,
          updatedAt: interviewer.updatedAt,
          voice: interviewer.voice,
        })
        .from(interviewer)
        .leftJoin(department, eq(interviewer.departmentId, department.id))
        .where(where)
        .orderBy(order, desc(interviewer.id))
        .limit(query.pageSize)
        .offset(offset),
      this.database.select({ count: count() }).from(interviewer).where(where),
    ]);
    const ids = rows.map((row) => row.id);
    const refs = ids.length
      ? await this.database
          .select({ count: count(), interviewerId: jobDescriptionInterviewer.interviewerId })
          .from(jobDescriptionInterviewer)
          .where(inArray(jobDescriptionInterviewer.interviewerId, ids))
          .groupBy(jobDescriptionInterviewer.interviewerId)
      : [];
    const refCounts = new Map(refs.map((row) => [row.interviewerId, row.count]));
    const total = totalRows[0]?.count ?? 0;
    return {
      page: query.page,
      pageSize: query.pageSize,
      records: rows.map((row) => ({
        ...serialize(row),
        departmentName: row.departmentName,
        jobDescriptionCount: refCounts.get(row.id) ?? 0,
      })),
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  async listAll(organizationId: string) {
    const rows = await this.database
      .select({
        createdAt: interviewer.createdAt,
        createdBy: interviewer.createdBy,
        departmentId: interviewer.departmentId,
        departmentName: department.name,
        description: interviewer.description,
        id: interviewer.id,
        name: interviewer.name,
        prompt: interviewer.prompt,
        updatedAt: interviewer.updatedAt,
        voice: interviewer.voice,
      })
      .from(interviewer)
      .leftJoin(department, eq(interviewer.departmentId, department.id))
      .where(eq(interviewer.organizationId, organizationId))
      .orderBy(asc(interviewer.name));
    return {
      records: rows.map((row) => ({
        ...serialize(row),
        departmentName: row.departmentName,
        jobDescriptionCount: 0,
      })),
    };
  }

  async create(organizationId: string, actorId: string, input: InterviewerInput) {
    await this.requireDepartment(organizationId, input.departmentId);
    const now = new Date();
    const row = {
      createdAt: now,
      createdBy: actorId,
      departmentId: input.departmentId,
      description: input.description?.trim() || null,
      id: crypto.randomUUID(),
      name: input.name.trim(),
      organizationId,
      prompt: input.prompt.trim(),
      updatedAt: now,
      voice: input.voice,
    } satisfies typeof interviewer.$inferInsert;
    await this.database.insert(interviewer).values(row);
    return serialize(row);
  }

  async get(organizationId: string, id: string) {
    const rows = await this.database
      .select()
      .from(interviewer)
      .where(and(eq(interviewer.id, id), eq(interviewer.organizationId, organizationId)))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("面试官不存在。", { errorCode: "INTERVIEWER_NOT_FOUND" });
    }
    return serialize(rows[0]);
  }

  async update(organizationId: string, id: string, input: InterviewerUpdate) {
    const existing = await this.get(organizationId, id);
    if (input.departmentId !== existing.departmentId) {
      await this.requireDepartment(organizationId, input.departmentId);
    }
    const rows = await this.database
      .update(interviewer)
      .set({
        departmentId: input.departmentId,
        description: input.description?.trim() || null,
        name: input.name.trim(),
        prompt: input.prompt.trim(),
        updatedAt: new Date(),
        voice: input.voice,
      })
      .where(and(eq(interviewer.id, id), eq(interviewer.organizationId, organizationId)))
      .returning();
    return serialize(rows[0]);
  }

  async remove(organizationId: string, id: string) {
    await this.get(organizationId, id);
    const refs = await this.database
      .select({ count: count() })
      .from(jobDescriptionInterviewer)
      .where(eq(jobDescriptionInterviewer.interviewerId, id));
    const jobDescriptionCount = refs[0]?.count ?? 0;
    if (jobDescriptionCount > 0) {
      throw new BadRequestException("该面试官仍被在招岗位引用，无法删除。", {
        cause: { jobDescriptionCount },
        errorCode: "INTERVIEWER_IN_USE",
      });
    }
    await this.database
      .delete(interviewer)
      .where(and(eq(interviewer.id, id), eq(interviewer.organizationId, organizationId)));
    return { success: true } as const;
  }
}
