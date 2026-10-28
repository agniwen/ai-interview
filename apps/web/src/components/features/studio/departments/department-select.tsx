import type { DepartmentListRecord } from "@app/shared/departments";
import { IconPlus, IconSettings } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";
import { DepartmentFormDialog } from "@/components/features/studio/departments/department-form-dialog";
import { DepartmentManageList } from "@/components/features/studio/departments/department-manage-list";
import { Badge } from "@/components/ui/badge";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { useHasPermission } from "@/hooks/use-has-permission";

const ALL_DEPARTMENTS_VALUE = "__all__";
const CREATE_DEPARTMENT_VALUE = "__create__";
const MANAGE_DEPARTMENTS_VALUE = "__manage__";
// 选项文本（Base UI 渲染为 div）撑满整行，岗位数量才能靠右对齐。
// The item text (a div in Base UI) fills the row so the job count sits at the trailing edge.
const OPTION_CLASS = "*:last:min-w-0 *:last:flex-1";

function DepartmentOptionLabel({ count, label }: { count: number; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Badge className="shrink-0 tabular-nums">{count}</Badge>
    </span>
  );
}

/**
 * 岗位列表筛选栏中的部门下拉：选择即筛选，并提供新建部门与管理部门入口。
 * Department select leading the job list filters: picks the filter and offers create / manage entries.
 */
export function DepartmentSelect({
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
  const canCreateDepartment = useHasPermission("department", "create");
  const canUpdateDepartment = useHasPermission("department", "update");
  const canDeleteDepartment = useHasPermission("department", "delete");
  const canReadInterviewers = useHasPermission("interviewer", "read");
  const canManageDepartments = canUpdateDepartment || canDeleteDepartment || canReadInterviewers;
  const [manageOpen, setManageOpen] = useState(false);
  const triggerId = useId();
  const [createOpen, setCreateOpen] = useState(false);
  // 新建的部门要等列表刷新后再选中，否则会被「部门不存在则回到全部」的逻辑重置。
  // Select a new department only once the refreshed list contains it; otherwise the
  // "unknown department falls back to all" guard would reset it.
  const pendingDepartmentIdRef = useRef<string | null>(null);

  useEffect(() => {
    const pendingId = pendingDepartmentIdRef.current;
    if (pendingId && departments.some((item) => item.id === pendingId)) {
      pendingDepartmentIdRef.current = null;
      onSelect(pendingId);
    }
  }, [departments, onSelect]);

  const totalJobCount = departments.reduce((sum, item) => sum + item.jobDescriptionCount, 0);

  return (
    <>
      <Select
        onValueChange={(value) => {
          if (value === CREATE_DEPARTMENT_VALUE) {
            setCreateOpen(true);
            return;
          }
          if (value === MANAGE_DEPARTMENTS_VALUE) {
            setManageOpen(true);
            return;
          }
          onSelect(!value || value === ALL_DEPARTMENTS_VALUE ? "" : value);
        }}
        value={selectedDepartmentId || ALL_DEPARTMENTS_VALUE}
      >
        {/* 与筛选芯片同款：字段名 + 值。/ Matches the filter chips: field name + value. */}
        <ButtonGroup attached className="h-8 min-w-0 max-w-full">
          <ButtonGroupText
            className="shrink-0 cursor-default bg-control"
            // oxlint-disable-next-line jsx-a11y/label-has-associated-control -- The label text is the ButtonGroupText child; htmlFor ties it to the trigger.
            render={<label htmlFor={triggerId} />}
          >
            部门
          </ButtonGroupText>
          <SelectTrigger className="h-8 min-w-40 rounded-lg bg-control font-medium" id={triggerId}>
            <SelectValue />
          </SelectTrigger>
        </ButtonGroup>
        <SelectContent align="start" alignItemWithTrigger={false}>
          <SelectItem className={OPTION_CLASS} label="全部岗位" value={ALL_DEPARTMENTS_VALUE}>
            <DepartmentOptionLabel count={totalJobCount} label="全部岗位" />
          </SelectItem>
          {departments.map((department) => (
            <SelectItem
              className={OPTION_CLASS}
              key={department.id}
              label={department.name}
              value={department.id}
            >
              <DepartmentOptionLabel
                count={department.jobDescriptionCount}
                label={department.name}
              />
            </SelectItem>
          ))}
          {canCreateDepartment || canManageDepartments ? <SelectSeparator /> : null}
          {canCreateDepartment ? (
            <SelectItem label="新建部门" value={CREATE_DEPARTMENT_VALUE}>
              <span className="flex items-center gap-2">
                <IconPlus className="size-4" />
                新建部门
              </span>
            </SelectItem>
          ) : null}
          {canManageDepartments ? (
            <SelectItem label="管理部门" value={MANAGE_DEPARTMENTS_VALUE}>
              <span className="flex items-center gap-2">
                <IconSettings className="size-4" />
                管理部门
              </span>
            </SelectItem>
          ) : null}
        </SelectContent>
      </Select>

      {canCreateDepartment ? (
        <DepartmentFormDialog
          onOpenChange={setCreateOpen}
          onSaved={(saved) => {
            onChanged();
            if (saved.id) {
              pendingDepartmentIdRef.current = saved.id;
            }
          }}
          open={createOpen}
          record={null}
        />
      ) : null}

      <Modal onOpenChange={setManageOpen} open={manageOpen} size="sm" title="管理部门">
        <DepartmentManageList
          departments={departments}
          onChanged={onChanged}
          onSelect={(departmentId) => {
            onSelect(departmentId);
            setManageOpen(false);
          }}
          selectedDepartmentId={selectedDepartmentId}
        />
      </Modal>
    </>
  );
}
