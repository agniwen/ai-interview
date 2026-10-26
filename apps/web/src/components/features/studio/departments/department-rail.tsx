import type { DepartmentListRecord } from "@app/shared/departments";
import { IconDots, IconPlus } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { DepartmentFormDialog } from "@/components/features/studio/departments/department-form-dialog";
import { EntityDeleteDialog } from "@/components/features/studio/entity-delete-dialog";
import { ScopedInterviewersModal } from "@/components/features/studio/scoped-interviewers-modal";
import { useEntityCrud } from "@/components/features/studio/use-entity-crud";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHasPermission } from "@/hooks/use-has-permission";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { cn } from "@app/shared/utils";

// 计数与「更多」按钮共用行尾同一位置：悬停、聚焦或菜单打开时计数淡出、按钮淡入，
// 整行作为一个高亮面，按钮不会溢出到高亮之外。触屏下两者并排常显。
// The count and the "more" trigger share the trailing slot: hover, focus or an open menu swaps
// them, so the whole row stays one highlight. Touch pointers show both side by side.
function DepartmentRailItem({
  actions,
  count,
  label,
  onSelect,
  selected,
}: {
  actions?: ReactNode;
  count: number;
  label: string;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <li
      className={cn(
        "group/row relative flex h-8 items-center rounded-lg transition-colors hover:bg-component has-data-popup-open:bg-component",
        selected && "bg-component font-medium text-foreground hover:bg-component-hover",
      )}
    >
      <button
        aria-pressed={selected}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
          actions && "pointer-coarse:pr-9",
        )}
        onClick={onSelect}
        type="button"
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span
          className={cn(
            "min-w-6 shrink-0 text-right text-muted-foreground text-xs tabular-nums transition-opacity duration-150",
            actions &&
              "group-focus-within/row:opacity-0 group-hover/row:opacity-0 group-has-data-popup-open/row:opacity-0 pointer-coarse:opacity-100!",
          )}
        >
          {count}
        </span>
      </button>
      {actions ? (
        <div className="absolute inset-y-0 right-1 flex items-center">{actions}</div>
      ) : null}
    </li>
  );
}

/**
 * 岗位设置页左侧的部门栏：选择部门即筛选右侧岗位列表，同时承载部门的增删改。
 * Department rail on the job settings page: selecting a department filters the job list,
 * and the rail also hosts department create / edit / delete.
 */
export function DepartmentRail({
  departments,
  onChanged,
  onSelect,
  selectedDepartmentId,
}: {
  departments: DepartmentListRecord[];
  onChanged: () => void;
  onSelect: (departmentId: string) => void;
  selectedDepartmentId: string;
}) {
  const slug = useWorkspaceSlug();
  const canCreateDepartment = useHasPermission("department", "create");
  const canUpdateDepartment = useHasPermission("department", "update");
  const canDeleteDepartment = useHasPermission("department", "delete");
  const canReadInterviewers = useHasPermission("interviewer", "read");
  const [interviewersDepartment, setInterviewersDepartment] = useState<DepartmentListRecord | null>(
    null,
  );

  const crud = useEntityCrud<DepartmentListRecord, DepartmentListRecord>({
    deleteEntity: (record) =>
      rpc.api.w[":slug"].studio.departments[":id"].$delete({ param: { id: record.id, slug } }),
    detailFromList: (record) => record,
    invalidate: onChanged,
    messages: { deleteSuccess: "部门已删除" },
  });

  const totalJobCount = departments.reduce((sum, item) => sum + item.jobDescriptionCount, 0);
  const hasRowActions = canUpdateDepartment || canDeleteDepartment || canReadInterviewers;

  return (
    <>
      <aside
        aria-labelledby="department-rail-title"
        className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-control shadow-default lg:sticky lg:top-4 lg:self-start"
      >
        <div className="flex h-11 items-center justify-between gap-2 border-border-subtle border-b pr-2 pl-4">
          <h2 className="font-medium text-sm" id="department-rail-title">
            部门
          </h2>
          {canCreateDepartment ? (
            <Button
              aria-label="新建部门"
              onClick={crud.openCreate}
              size="icon-sm"
              title="新建部门"
              type="button"
              variant="ghost"
            >
              <IconPlus className="size-4" />
            </Button>
          ) : null}
        </div>
        <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto p-1.5 lg:max-h-[calc(100svh-14rem)]">
          <DepartmentRailItem
            count={totalJobCount}
            label="全部岗位"
            onSelect={() => onSelect("")}
            selected={!selectedDepartmentId}
          />
          {departments.map((department) => (
            <DepartmentRailItem
              actions={
                hasRowActions ? (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          aria-label={`${department.name}的更多操作`}
                          className="size-6 rounded-md text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-component-hover hover:text-foreground group-focus-within/row:opacity-100 group-hover/row:opacity-100 data-popup-open:bg-component-hover data-popup-open:opacity-100 pointer-coarse:opacity-100"
                          size="icon-xs"
                          type="button"
                          variant="ghost"
                        >
                          <IconDots className="size-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-40">
                      {canUpdateDepartment ? (
                        <DropdownMenuItem onClick={() => crud.openEdit(department)}>
                          编辑部门
                        </DropdownMenuItem>
                      ) : null}
                      {canReadInterviewers ? (
                        <DropdownMenuItem onClick={() => setInterviewersDepartment(department)}>
                          查看面试官（{department.interviewerCount}）
                        </DropdownMenuItem>
                      ) : null}
                      {canDeleteDepartment ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => crud.setDeleteRecord(department)}
                            variant="destructive"
                          >
                            删除
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : undefined
              }
              count={department.jobDescriptionCount}
              key={department.id}
              label={department.name}
              onSelect={() => onSelect(department.id)}
              selected={selectedDepartmentId === department.id}
            />
          ))}
        </ul>
        {departments.length === 0 ? (
          <p className="px-3 pb-3 text-muted-foreground text-xs leading-relaxed">
            {canCreateDepartment
              ? "还没有部门，可点击右上角新建，或在创建岗位时直接新建。"
              : "还没有部门，请联系管理员创建。"}
          </p>
        ) : null}
      </aside>

      {(crud.editingRecord ? canUpdateDepartment : canCreateDepartment) ? (
        <DepartmentFormDialog
          onOpenChange={crud.onFormOpenChange}
          onSaved={onChanged}
          open={crud.formDialogOpen}
          record={crud.editingRecord}
        />
      ) : null}

      <EntityDeleteDialog
        confirmDisabled={(record) => record.interviewerCount > 0 || record.jobDescriptionCount > 0}
        description={(record) =>
          record.interviewerCount > 0 || record.jobDescriptionCount > 0
            ? `部门「${record.name}」下仍有 ${record.jobDescriptionCount} 个岗位、${record.interviewerCount} 位面试官，请先移走或删除后再删除部门。`
            : `即将删除部门：${record.name}，删除后无法恢复。`
        }
        onClose={() => crud.setDeleteRecord(null)}
        onConfirm={crud.handleDelete}
        record={canDeleteDepartment ? crud.deleteRecord : null}
        title="确认删除这个部门？"
      />

      <ScopedInterviewersModal
        departmentId={interviewersDepartment?.id ?? null}
        departmentName={interviewersDepartment?.name ?? ""}
        onChange={onChanged}
        onOpenChange={(next) => {
          if (!next) {
            setInterviewersDepartment(null);
          }
        }}
        open={canReadInterviewers && interviewersDepartment !== null}
      />
    </>
  );
}
