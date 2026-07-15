import { Button } from "@mastra/playground-ui/components/Button";
import { Input } from "@mastra/playground-ui/components/Input";
import { Label } from "@mastra/playground-ui/components/Label";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mastra/playground-ui/components/Select";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Textarea } from "@mastra/playground-ui/components/Textarea";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { Check, PlusIcon, XIcon } from "lucide-react";
import { Controller, useWatch } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";

import { MCPServerCombobox } from "../mcp-server-combobox";
import type { MCPClientFormValues } from "./use-mcp-client-form";
import { SectionHeader } from "@/components/features/mastra-studio/upstream/domains/cms/components/section/section-header";

interface MCPClientFormSidebarProps {
  form: UseFormReturn<MCPClientFormValues>;
  onPublish: () => void;
  isSubmitting: boolean;
  onPreFillFromServer: (serverId: string) => void;
  containerRef?: React.RefObject<HTMLElement | null>;
  readOnly?: boolean;
  showSubmit?: boolean;
  submitLabel?: string;
  onTryConnect?: () => void;
  isTryingConnect?: boolean;
}

// Pin these fields to a solid surface. The filled Input/Textarea default otherwise swaps the
// background to a translucent overlay on hover/focus, which leaks through the forced solid bg —
// re-stating it for hover/focus-visible keeps the whole form a uniform surface3 (incl. the Select).
const SOLID_FIELD = "bg-surface3 hover:bg-surface3 focus-visible:bg-surface3";

export function MCPClientFormSidebar({
  form,
  onPublish,
  isSubmitting,
  onPreFillFromServer,
  containerRef,
  readOnly,
  showSubmit,
  submitLabel = "创建 MCP 客户端",
  onTryConnect,
  isTryingConnect,
}: MCPClientFormSidebarProps) {
  const {
    register,
    control,
    formState: { errors },
    setValue,
    getValues,
  } = form;

  const serverType = useWatch({ control, name: "serverType" });
  const url = useWatch({ control, name: "url" });
  const env = useWatch({ control, name: "env" });

  const addEnvVar = () => {
    const current = getValues("env");
    setValue("env", [...current, { key: "", value: "" }]);
  };

  const removeEnvVar = (index: number) => {
    const current = getValues("env");
    setValue(
      "env",
      current.filter((_, i) => i !== index),
    );
  };

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-6 p-4">
          <SectionHeader title="基本信息" subtitle="设置 MCP 客户端的名称和描述。" />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mcp-client-name" className="text-xs text-neutral5">
              名称 <span className="text-accent2">*</span>
            </Label>
            <Input
              id="mcp-client-name"
              placeholder="我的 MCP 客户端"
              className={SOLID_FIELD}
              disabled={readOnly}
              {...register("name")}
              error={!!errors.name}
            />
            {errors.name && <span className="text-xs text-accent2">{errors.name.message}</span>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mcp-client-description" className="text-xs text-neutral5">
              描述
            </Label>
            <Textarea
              id="mcp-client-description"
              placeholder="描述此 MCP 客户端连接的内容"
              className={SOLID_FIELD}
              disabled={readOnly}
              {...register("description")}
            />
          </div>

          {!readOnly && (
            <>
              <SectionHeader title="从服务器预填" subtitle="选择现有 MCP 服务器以预填设置。" />

              <div className="flex flex-col gap-1.5">
                <MCPServerCombobox
                  onValueChange={onPreFillFromServer}
                  placeholder="选择服务器..."
                  searchPlaceholder="搜索服务器..."
                  emptyText="未找到服务器"
                  container={containerRef}
                />
              </div>
            </>
          )}

          <SectionHeader title="服务器配置" subtitle="配置 MCP 服务器的连接详情。" />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mcp-server-name" className="text-xs text-neutral5">
              服务器名称 <span className="text-accent2">*</span>
            </Label>
            <Input
              id="mcp-server-name"
              placeholder="default"
              className={SOLID_FIELD}
              disabled={readOnly}
              {...register("serverName")}
              error={!!errors.serverName}
            />
            {errors.serverName && (
              <span className="text-xs text-accent2">{errors.serverName.message}</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-neutral5">服务器类型</Label>
            <Controller
              name="serverType"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                  <SelectTrigger className="bg-surface3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="stdio">Stdio</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {serverType === "http" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mcp-url" className="text-xs text-neutral5">
                  URL <span className="text-accent2">*</span>
                </Label>
                <Input
                  id="mcp-url"
                  placeholder="http://localhost:4111/api/mcp/server/mcp"
                  className={SOLID_FIELD}
                  disabled={readOnly}
                  {...register("url")}
                  error={!!errors.url}
                />
                {errors.url && <span className="text-xs text-accent2">{errors.url.message}</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mcp-timeout" className="text-xs text-neutral5">
                  超时时间（毫秒）
                </Label>
                <Input
                  id="mcp-timeout"
                  type="number"
                  placeholder="30000"
                  className={SOLID_FIELD}
                  disabled={readOnly}
                  {...register("timeout", { valueAsNumber: true })}
                />
              </div>
            </>
          )}

          {serverType === "stdio" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mcp-command" className="text-xs text-neutral5">
                  命令 <span className="text-accent2">*</span>
                </Label>
                <Input
                  id="mcp-command"
                  placeholder="npx"
                  className={SOLID_FIELD}
                  disabled={readOnly}
                  {...register("command")}
                  error={!!errors.command}
                />
                {errors.command && (
                  <span className="text-xs text-accent2">{errors.command.message}</span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mcp-args" className="text-xs text-neutral5">
                  参数（每行一个）
                </Label>
                <Textarea
                  id="mcp-args"
                  placeholder={"-y\n@modelcontextprotocol/server"}
                  className={SOLID_FIELD}
                  disabled={readOnly}
                  {...register("args")}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-neutral5">环境变量</Label>
                <div className="flex flex-col gap-2">
                  {env.map((_, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Input
                        placeholder="键"
                        className={`${SOLID_FIELD} flex-1`}
                        disabled={readOnly}
                        {...register(`env.${index}.key`)}
                      />
                      <Input
                        placeholder="值"
                        className={`${SOLID_FIELD} flex-1`}
                        disabled={readOnly}
                        {...register(`env.${index}.value`)}
                      />
                      {!readOnly && (
                        <Button variant="ghost" size="sm" onClick={() => removeEnvVar(index)}>
                          <XIcon className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {!readOnly && (
                    <Button variant="outline" size="sm" onClick={addEnvVar} className="w-fit">
                      <PlusIcon className="h-3 w-3 mr-1" />
                      添加变量
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {(showSubmit ?? !readOnly) && (
        <div className="shrink-0 p-4 flex flex-col gap-2">
          {!readOnly &&
            (() => {
              const isDisabled = serverType !== "http" || !url.trim() || isTryingConnect;
              let tooltipContent: string | undefined;
              if (serverType === "http") {
                tooltipContent = url.trim() ? undefined : "请先输入 URL";
              } else {
                tooltipContent = "仅适用于 HTTP 服务器";
              }

              return tooltipContent ? (
                <Button
                  variant="outline"
                  onClick={onTryConnect}
                  disabled={isDisabled}
                  className="w-full"
                  tooltip={tooltipContent}
                >
                  {isTryingConnect ? (
                    <>
                      <Spinner className="h-4 w-4" />
                      正在连接...
                    </>
                  ) : (
                    "尝试连接"
                  )}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={onTryConnect}
                  disabled={isDisabled}
                  className="w-full"
                >
                  {isTryingConnect ? (
                    <>
                      <Spinner className="h-4 w-4" />
                      正在连接...
                    </>
                  ) : (
                    "尝试连接"
                  )}
                </Button>
              );
            })()}
          <Button variant="primary" onClick={onPublish} disabled={isSubmitting} className="w-full">
            {isSubmitting ? (
              <>
                <Spinner className="h-4 w-4" />
                正在创建...
              </>
            ) : (
              <>
                <Icon>
                  <Check />
                </Icon>
                {submitLabel}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
