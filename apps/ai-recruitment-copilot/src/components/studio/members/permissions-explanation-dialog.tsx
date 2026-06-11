"use client";

import { CircleHelpIcon } from "lucide-react";
import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowDivider,
} from "@/components/ui/table";
import { WORKSPACE_ROLES, getWorkspaceRoleLabel } from "./role-display";

const ROLE_COLUMNS = WORKSPACE_ROLES;

const ROLE_SUMMARIES = {
  admin: "日常管理权限",
  member: "招聘组决定业务范围",
  owner: "完整管理权限",
} as const satisfies Record<(typeof ROLE_COLUMNS)[number], string>;

const PERMISSION_ROWS = [
  {
    admin: "邀请、移除成员；可将其他成员调整为普通成员（不能调整其他管理员或自己）",
    member: "无",
    owner: "邀请、移除成员；调整任意角色；转让所有权",
    resource: "成员管理",
  },
  {
    admin: "新增、查看、编辑、删除",
    member: "由招聘组内角色决定",
    owner: "新增、查看、编辑、删除",
    resource: "面试",
  },
  {
    admin: "新增、查看、编辑、删除",
    member: "由招聘组内角色决定",
    owner: "新增、查看、编辑、删除",
    resource: "职位 JD",
  },
  {
    admin: "新增、查看、编辑、删除",
    member: "由招聘组内角色决定",
    owner: "新增、查看、编辑、删除",
    resource: "部门",
  },
  {
    admin: "新增、查看、编辑、删除",
    member: "由招聘组内角色决定",
    owner: "新增、查看、编辑、删除",
    resource: "面试官",
  },
  {
    admin: "新增、查看、编辑、删除",
    member: "由招聘组内角色决定",
    owner: "新增、查看、编辑、删除",
    resource: "候选人表单",
  },
  {
    admin: "新增、查看、编辑、删除",
    member: "由招聘组内角色决定",
    owner: "新增、查看、编辑、删除",
    resource: "面试题模板",
  },
  {
    admin: "查看、编辑",
    member: "查看",
    owner: "查看、编辑",
    resource: "系统设置",
  },
  {
    admin: "新增、查看、编辑、删除",
    member: "新增、查看、编辑、删除",
    owner: "新增、查看、编辑、删除",
    resource: "聊天助手",
  },
  {
    admin: "查看",
    member: "无",
    owner: "查看",
    resource: "审计日志",
  },
] as const;

function PermissionCell({ value }: { value: string }) {
  if (value === "无") {
    return <span className="text-muted-foreground">无</span>;
  }

  return <span className="text-foreground">{value}</span>;
}

export function PermissionsExplanationDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="flex-1 sm:flex-none" variant="outline">
          <CircleHelpIcon data-icon="inline-start" />
          权限说明
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>工作区权限说明</DialogTitle>
          <DialogDescription>
            工作区角色只区分管理身份；招聘业务范围由招聘组内角色决定。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-20 min-w-32 shadow-[1px_0_0_0_var(--border)]">
                  权限模块
                </TableHead>
                {ROLE_COLUMNS.map((role) => (
                  <TableHead className="min-w-44" key={role}>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {getWorkspaceRoleLabel(role)}
                        </span>
                      </div>
                      <span className="font-normal text-muted-foreground text-xs">
                        {ROLE_SUMMARIES[role]}
                      </span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSION_ROWS.map((row, index) => (
                <Fragment key={row.resource}>
                  <TableRow>
                    <TableCell className="sticky left-0 z-10 bg-background font-medium shadow-[1px_0_0_0_var(--border)]">
                      <Badge className="font-normal" variant="secondary">
                        {row.resource}
                      </Badge>
                    </TableCell>
                    {ROLE_COLUMNS.map((role) => (
                      <TableCell key={role}>
                        <PermissionCell value={row[role]} />
                      </TableCell>
                    ))}
                  </TableRow>
                  {index < PERMISSION_ROWS.length - 1 ? <TableRowDivider /> : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
