import {
  Module,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_ACCESS_PORT,
  WorkspaceAccessGuard,
} from "../../../infrastructure/http/workspace-access/index.js";
import { DepartmentController } from "./department.controller.js";
import { DepartmentService } from "./department.service.js";

const created = {
  createdAt: "2026-09-01T00:00:00.000Z",
  createdBy: "user-1",
  description: null,
  id: "department-1",
  name: "研发部",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const departmentService = {
  create: vi.fn(async () => created),
  get: vi.fn(),
  list: vi.fn(),
  listAll: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
};

const workspaceAccess = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "user-1" },
    member: {
      id: "member-1",
      organizationId: "organization-1",
      role: "member",
      userId: "user-1",
    },
    workspace: {
      id: "organization-1",
      logo: null,
      metadata: null,
      name: "测试工作区",
      slug: "test",
    },
  })),
};

@Module({
  controllers: [DepartmentController],
  providers: [
    WorkspaceAccessGuard,
    { provide: DepartmentService, useValue: departmentService },
    { provide: WORKSPACE_ACCESS_PORT, useValue: workspaceAccess },
  ],
})
class DepartmentContractTestModule {}

describe("workspace departments public HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });

  it("rejects an invalid request through Nest Standard Schema validation", async () => {
    const app = await NestFactory.create(DepartmentContractTestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
    await app.init();
    close = () => app.close();

    const response = await supertest(app.getHttpServer())
      .post("/api/w/test/studio/departments")
      .send({ name: "" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: "Bad Request", statusCode: 400 });
    expect(departmentService.create).not.toHaveBeenCalled();
  });

  it("creates a department and enforces its response schema", async () => {
    const app = await NestFactory.create(DepartmentContractTestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
    await app.init();
    close = () => app.close();

    const response = await supertest(app.getHttpServer())
      .post("/api/w/test/studio/departments")
      .send({ name: " 研发部 " });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(created);
    expect(departmentService.create).toHaveBeenCalledWith("organization-1", "user-1", {
      name: "研发部",
    });
  });

  it("routes the static /all path before the parameterized /:id path", async () => {
    departmentService.listAll.mockResolvedValueOnce({ records: [created] });
    const app = await NestFactory.create(DepartmentContractTestModule, {
      logger: false,
      routeConflictPolicy: { duplicate: "error", shadow: "warn" },
      routeResolutionStrategy: "specificity",
    });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
    await app.init();
    close = () => app.close();

    const response = await supertest(app.getHttpServer()).get("/api/w/test/studio/departments/all");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ records: [created] });
    expect(departmentService.listAll).toHaveBeenCalledWith("organization-1");
    expect(departmentService.get).not.toHaveBeenCalled();
  });
});
