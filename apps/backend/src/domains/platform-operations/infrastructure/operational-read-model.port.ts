import type { z } from "zod";
import type { HttpResponse } from "../../../infrastructure/http/http.ports.js";
import type {
  platformOrganizationMembersQuerySchema,
  platformOrganizationQuerySchema,
  platformUsersQuerySchema,
} from "../http/platform.schemas.js";

export const IDENTITY_OPERATIONAL_READ_MODEL = Symbol("IDENTITY_OPERATIONAL_READ_MODEL");

export interface IdentityOperationalReadModel {
  getOrganization(
    organizationId: string,
    query: z.infer<typeof platformOrganizationMembersQuerySchema>,
  ): Promise<HttpResponse | null>;
  getUserWorkspaces(userId: string): Promise<HttpResponse | null>;
  listOrganizations(query: z.infer<typeof platformOrganizationQuerySchema>): Promise<HttpResponse>;
  listUsers(query: z.infer<typeof platformUsersQuerySchema>): Promise<HttpResponse>;
}
