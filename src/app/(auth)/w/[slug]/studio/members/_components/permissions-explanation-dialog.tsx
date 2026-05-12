"use client";

import { CircleHelpIcon } from "lucide-react";
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
} from "@/components/ui/table";

const ROLE_COLUMNS = [
  { key: "owner", label: "Owner", name: "拥有者", summary: "完整管理权限" },
  { key: "admin", label: "Admin", name: "管理员", summary: "日常管理权限" },
  { key: "hr", label: "HR", name: "招聘成员", summary: "招聘协作权限" },
  { key: "viewer", label: "Viewer", name: "只读成员", summary: "查看与聊天权限" },
] as const;

const PERMISSION_ROWS = [
  {
    admin: "邀请、移除成员；不可调整角色",
    hr: "无",
    owner: "邀请、移除成员；调整角色；转让所有权",
    resource: "成员管理",
    viewer: "无",
  },
  {
    admin: "新增、查看、编辑、删除",
    hr: "新增、查看、编辑",
    owner: "新增、查看、编辑、删除",
    resource: "面试",
    viewer: "查看",
  },
  {
    admin: "新增、查看、编辑、删除",
    hr: "新增、查看、编辑",
    owner: "新增、查看、编辑、删除",
    resource: "职位 JD",
    viewer: "查看",
  },
  {
    admin: "新增、查看、编辑、删除",
    hr: "查看",
    owner: "新增、查看、编辑、删除",
    resource: "部门",
    viewer: "查看",
  },
  {
    admin: "新增、查看、编辑、删除",
    hr: "查看",
    owner: "新增、查看、编辑、删除",
    resource: "面试官",
    viewer: "查看",
  },
  {
    admin: "新增、查看、编辑、删除",
    hr: "新增、查看、编辑、删除",
    owner: "新增、查看、编辑、删除",
    resource: "候选人表单",
    viewer: "查看",
  },
  {
    admin: "新增、查看、编辑、删除",
    hr: "新增、查看、编辑、删除",
    owner: "新增、查看、编辑、删除",
    resource: "面试题模板",
    viewer: "查看",
  },
  {
    admin: "查看、编辑",
    hr: "查看",
    owner: "查看、编辑",
    resource: "全局配置",
    viewer: "查看",
  },
  {
    admin: "新增、查看、编辑、删除",
    hr: "新增、查看、编辑、删除",
    owner: "新增、查看、编辑、删除",
    resource: "聊天助手",
    viewer: "新增、查看、编辑、删除",
  },
  {
    admin: "查看",
    hr: "无",
    owner: "查看",
    resource: "审计日志",
    viewer: "无",
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
            当前工作区使用 Better Auth 组织角色校验，以下权限与代码中的权限矩阵保持一致。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-auto rounded-md border bg-background">
          <Table className="border-separate border-spacing-0">
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className="sticky left-0 z-20 min-w-32 bg-muted px-4 py-3 font-semibold shadow-[1px_0_0_0_var(--border)]">
                  权限模块
                </TableHead>
                {ROLE_COLUMNS.map((role) => (
                  <TableHead className="min-w-44 bg-muted px-4 py-3" key={role.key}>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{role.name}</span>
                        <Badge className="w-fit font-normal" variant="outline">
                          {role.label}
                        </Badge>
                      </div>
                      <span className="font-normal text-muted-foreground text-xs">
                        {role.summary}
                      </span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSION_ROWS.map((row) => (
                <TableRow className="group/permission-row" key={row.resource}>
                  <TableCell className="sticky left-0 z-10 bg-background px-4 font-medium shadow-[1px_0_0_0_var(--border)] transition-colors group-hover/permission-row:bg-muted">
                    <Badge className="font-normal" variant="secondary">
                      {row.resource}
                    </Badge>
                  </TableCell>
                  {ROLE_COLUMNS.map((role) => (
                    <TableCell className="px-4" key={role.key}>
                      <PermissionCell value={row[role.key]} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
