import { headers as nextHeaders } from "next/headers";
import { auth } from "@/lib/auth";

// =====================================================================
// 包装 better-auth admin 插件的 listUsers，将其响应整形为 DataGrid 期望的
// { records, total, totalPages } 形态，便于复用 useDataGridState。
// Wraps better-auth's admin.listUsers and reshapes the response into the
// { records, total, totalPages } shape expected by useDataGridState.
// =====================================================================

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  organizationId: string | null;
  organizationName: string | null;
  image: string | null;
  createdAt: string;
}

export interface AdminUserListResult {
  records: AdminUserRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminUserListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
  banned?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

export async function listAdminUsers(params: AdminUserListParams): Promise<AdminUserListResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 10));
  const offset = (page - 1) * pageSize;

  const query: Record<string, string | number> = {
    limit: pageSize,
    offset,
    sortBy: params.sortBy ?? "createdAt",
    sortDirection: params.sortOrder ?? "desc",
  };

  if (params.search?.trim()) {
    query.searchField = "email";
    query.searchOperator = "contains";
    query.searchValue = params.search.trim();
  }

  if (params.role && params.role !== "all") {
    query.filterField = "role";
    query.filterOperator = "eq";
    query.filterValue = params.role;
  } else if (params.banned === "true" || params.banned === "false") {
    query.filterField = "banned";
    query.filterOperator = "eq";
    query.filterValue = params.banned;
  }

  const result = await auth.api.listUsers({
    headers: await nextHeaders(),
    query,
  });

  const users = (result.users ?? []) as {
    id: string;
    name: string;
    email: string;
    role?: string | null;
    banned?: boolean | null;
    banReason?: string | null;
    banExpires?: Date | string | null;
    organizationId?: string | null;
    organizationName?: string | null;
    image?: string | null;
    createdAt: Date | string;
  }[];

  const records: AdminUserRecord[] = users.map((u) => ({
    banExpires: toIsoString(u.banExpires),
    banReason: u.banReason ?? null,
    banned: Boolean(u.banned),
    createdAt: toIsoString(u.createdAt) ?? new Date().toISOString(),
    email: u.email,
    id: u.id,
    image: u.image ?? null,
    name: u.name,
    organizationId: u.organizationId ?? null,
    organizationName: u.organizationName ?? null,
    role: u.role ?? "user",
  }));

  const total = result.total ?? records.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return { page, pageSize, records, total, totalPages };
}
