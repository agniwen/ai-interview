"use client";

import { IconBuilding, IconUsers } from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  actionsColumn,
  customColumn,
  DataGrid,
  dateColumn,
  textColumn,
  useDataGridState,
} from "@/components/data-grid";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { OrgDetailDialog } from "./org-detail-dialog";

interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  createdAt: string;
}

interface OrganizationsResult {
  records: OrganizationRecord[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

type OrganizationSortColumn = "createdAt" | "memberCount" | "name" | "slug";

interface OrganizationsQuery {
  page: string;
  pageSize: string;
  search?: string;
  sortBy: OrganizationSortColumn;
  sortOrder: "asc" | "desc";
}

function isOrganizationSortColumn(sortBy: string): sortBy is OrganizationSortColumn {
  return ["createdAt", "memberCount", "name", "slug"].some((column) => column === sortBy);
}

export function OrganizationsGrid() {
  const [detailOrgId, setDetailOrgId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchOrganizations = useMemo(
    () =>
      (params: {
        search: string;
        page: number;
        pageSize: number;
        filters: Record<string, never>;
        sortBy?: string;
        sortOrder?: "asc" | "desc";
      }): Promise<OrganizationsResult> => {
        const query: OrganizationsQuery = {
          page: String(params.page),
          pageSize: String(params.pageSize),
          sortBy:
            params.sortBy && isOrganizationSortColumn(params.sortBy) ? params.sortBy : "createdAt",
          sortOrder: params.sortOrder ?? "desc",
        };
        if (params.search) {
          query.search = params.search;
        }
        return rpcFetch<OrganizationsResult>(
          rpc.api.platform.organizations.$get({ query }),
          "加载工作区列表失败",
        );
      },
    [],
  );

  const grid = useDataGridState<OrganizationRecord, Record<string, never>>({
    allowedSortIds: ["name", "slug", "createdAt", "memberCount"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: {},
    queryFn: fetchOrganizations,
    queryKeyBase: ["platform-organizations"],
  });

  const handleViewDetail = useCallback((record: OrganizationRecord) => {
    setDetailOrgId(record.id);
    setDetailOpen(true);
  }, []);

  const columns = useMemo(
    () => [
      textColumn<OrganizationRecord>({
        key: "name",
        primary: true,
        title: "名称",
      }),
      textColumn<OrganizationRecord>({
        fallback: "—",
        key: "slug",
        muted: true,
        title: "Slug",
      }),
      customColumn<OrganizationRecord>({
        cell: (r) => (
          <Badge variant="outline">
            <IconUsers className="mr-1 size-3" />
            {r.memberCount} 成员
          </Badge>
        ),
        key: "memberCount",
        title: "成员数",
      }),
      dateColumn<OrganizationRecord>({
        key: "createdAt",
        sortable: true,
        title: "创建时间",
      }),
      actionsColumn<OrganizationRecord>({
        inline: [
          {
            label: "查看",
            onClick: handleViewDetail,
          },
        ],
      }),
    ],
    [handleViewDetail],
  );

  return (
    <>
      <DataGrid<OrganizationRecord>
        {...grid.bind}
        columns={columns}
        empty={
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconBuilding className="size-5" />
              </EmptyMedia>
              <EmptyTitle>还没有工作区</EmptyTitle>
            </EmptyHeader>
          </Empty>
        }
        filters={[
          {
            key: "search",
            minWidth: "20rem",
            placeholder: "搜索名称或 slug",
            type: "search",
          },
        ]}
        getRowId={(r) => r.id}
      />

      <OrgDetailDialog onOpenChange={setDetailOpen} open={detailOpen} orgId={detailOrgId} />
    </>
  );
}
