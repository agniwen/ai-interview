import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { parseListTextFilters } from "@arc/shared/list-text-filters";
import { department, interviewer, jobDescription } from "@arc/db-schema/schema";
import { WORKSPACE_DATABASE_PORT } from "../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";
import type { z } from "zod";
import type {
  departmentFormSchema,
  departmentListQuerySchema,
  departmentUpdateSchema,
} from "./department.schemas.js";

type DepartmentInput = z.infer<typeof departmentFormSchema>;
type DepartmentUpdate = z.infer<typeof departmentUpdateSchema>;
type DepartmentListQuery = z.infer<typeof departmentListQuerySchema>;

function serialize(row: typeof department.$inferSelect) {
  return {
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    name: row.name,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class DepartmentService {
  constructor(@Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort) {}

  async list(organizationId: string, query: DepartmentListQuery) {
    const textFilters = parseListTextFilters(query.textFilters);
    const filters = [eq(department.organizationId, organizationId)];
    if (query.search) {
      const searchFilter = or(
        ilike(department.name, `%${query.search}%`),
        ilike(department.description, `%${query.search}%`),
      );
      if (searchFilter) {
        filters.push(searchFilter);
      }
    }
    if (textFilters.name) {
      filters.push(ilike(department.name, `%${textFilters.name}%`));
    }
    if (textFilters.description) {
      filters.push(ilike(department.description, `%${textFilters.description}%`));
    }
    const where = and(...filters);
    let order = query.sortOrder === "asc" ? asc(department.createdAt) : desc(department.createdAt);
    if (query.sortBy === "name") {
      order = query.sortOrder === "asc" ? asc(department.name) : desc(department.name);
    } else if (query.sortBy === "updatedAt") {
      order = query.sortOrder === "asc" ? asc(department.updatedAt) : desc(department.updatedAt);
    }
    const offset = (query.page - 1) * query.pageSize;
    const [rows, totalRows] = await Promise.all([
      this.database
        .select()
        .from(department)
        .where(where)
        .orderBy(order, desc(department.id))
        .limit(query.pageSize)
        .offset(offset),
      this.database.select({ count: count() }).from(department).where(where),
    ]);
    const ids = rows.map((row) => row.id);
    const [interviewerRefs, jobRefs] = ids.length
      ? await Promise.all([
          this.database
            .select({ count: count(), departmentId: interviewer.departmentId })
            .from(interviewer)
            .where(inArray(interviewer.departmentId, ids))
            .groupBy(interviewer.departmentId),
          this.database
            .select({ count: count(), departmentId: jobDescription.departmentId })
            .from(jobDescription)
            .where(inArray(jobDescription.departmentId, ids))
            .groupBy(jobDescription.departmentId),
        ])
      : [[], []];
    const interviewerCounts = new Map(interviewerRefs.map((row) => [row.departmentId, row.count]));
    const jobCounts = new Map(jobRefs.map((row) => [row.departmentId, row.count]));
    const total = totalRows[0]?.count ?? 0;
    return {
      page: query.page,
      pageSize: query.pageSize,
      records: rows.map((row) => ({
        ...serialize(row),
        interviewerCount: interviewerCounts.get(row.id) ?? 0,
        jobDescriptionCount: jobCounts.get(row.id) ?? 0,
      })),
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  async listAll(organizationId: string) {
    const rows = await this.database
      .select()
      .from(department)
      .where(eq(department.organizationId, organizationId))
      .orderBy(asc(department.name));
    return { records: rows.map(serialize) };
  }

  async create(organizationId: string, actorId: string, input: DepartmentInput) {
    const now = new Date();
    const row = {
      createdAt: now,
      createdBy: actorId,
      description: input.description?.trim() || null,
      id: crypto.randomUUID(),
      name: input.name.trim(),
      organizationId,
      updatedAt: now,
    } satisfies typeof department.$inferInsert;
    await this.database.insert(department).values(row);
    return serialize(row);
  }

  async get(organizationId: string, id: string) {
    const rows = await this.database
      .select()
      .from(department)
      .where(and(eq(department.organizationId, organizationId), eq(department.id, id)))
      .limit(1);
    const [row] = rows;
    if (!row) {
      throw new NotFoundException("部门不存在。", { errorCode: "DEPARTMENT_NOT_FOUND" });
    }
    return serialize(row);
  }

  async update(organizationId: string, id: string, input: DepartmentUpdate) {
    await this.get(organizationId, id);
    const rows = await this.database
      .update(department)
      .set({
        description: input.description?.trim() || null,
        name: input.name.trim(),
        updatedAt: new Date(),
      })
      .where(and(eq(department.organizationId, organizationId), eq(department.id, id)))
      .returning();
    return serialize(rows[0]);
  }

  async remove(organizationId: string, id: string) {
    await this.get(organizationId, id);
    const [interviewerRefs, jobRefs] = await Promise.all([
      this.database
        .select({ count: count() })
        .from(interviewer)
        .where(eq(interviewer.departmentId, id)),
      this.database
        .select({ count: count() })
        .from(jobDescription)
        .where(eq(jobDescription.departmentId, id)),
    ]);
    const refs = {
      interviewerCount: interviewerRefs[0]?.count ?? 0,
      jobDescriptionCount: jobRefs[0]?.count ?? 0,
    };
    if (refs.interviewerCount > 0 || refs.jobDescriptionCount > 0) {
      throw new BadRequestException("该部门下仍有面试官或在招岗位，无法删除。", {
        cause: refs,
        errorCode: "DEPARTMENT_IN_USE",
      });
    }
    await this.database
      .delete(department)
      .where(and(eq(department.organizationId, organizationId), eq(department.id, id)));
    return { success: true } as const;
  }
}
