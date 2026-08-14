import { Badge } from "@mastra/playground-ui/components/Badge";
import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { Combobox } from "@mastra/playground-ui/components/Combobox";
import { CopyButton } from "@mastra/playground-ui/components/CopyButton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@mastra/playground-ui/components/Dialog";
import { DropdownMenu } from "@mastra/playground-ui/components/DropdownMenu";
import { Input } from "@mastra/playground-ui/components/Input";
import { Label } from "@mastra/playground-ui/components/Label";
import {
  HoverPopover,
  PopoverTrigger,
  PopoverContent,
} from "@mastra/playground-ui/components/Popover";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import {
  Check,
  ChevronDown,
  Download,
  GitPullRequest,
  Info,
  MessageSquare,
  Save,
} from "lucide-react";
import { useMemo, useState, useCallback } from "react";

import { useAgentVersions } from "../../hooks/use-agent-versions";
import { resolveConditional } from "../../utils/conditional";

interface AgentPlaygroundVersionBarProps {
  agentId: string;
  activeVersionId?: string;
  selectedVersionId?: string;
  onVersionSelect: (versionId: string) => void;
  isDirty: boolean;
  isSavingDraft: boolean;
  isPublishing: boolean;
  hasDraft: boolean;
  readOnly: boolean;
  isCodeSourceAgent?: boolean;
  showCodeModeActions?: boolean;
  canOpenPr?: boolean;
  openPrTitle?: string;
  onSaveDraft: (changeMessage?: string) => Promise<void>;
  onPublish: () => Promise<void>;
  onDownloadJson?: () => Promise<void>;
  onOpenPr?: () => Promise<void>;
  /** Whether the user is viewing a previous (non-latest) version that can be published */
  isViewingPreviousVersion?: boolean;
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function AgentPlaygroundVersionBar({
  agentId,
  activeVersionId,
  selectedVersionId,
  onVersionSelect,
  isDirty,
  isSavingDraft,
  isPublishing,
  hasDraft,
  readOnly,
  isCodeSourceAgent = false,
  showCodeModeActions = false,
  canOpenPr = false,
  openPrTitle,
  onSaveDraft,
  onPublish,
  onDownloadJson,
  onOpenPr,
  isViewingPreviousVersion = false,
}: AgentPlaygroundVersionBarProps) {
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [changeMessage, setChangeMessage] = useState("");

  const { data } = useAgentVersions({
    agentId,
    params: { orderBy: { direction: "DESC" } },
  });

  const versions = useMemo(() => data?.versions ?? [], [data?.versions]);
  const [latestVersion] = versions;

  const activeVersion = activeVersionId
    ? versions.find((v) => v.id === activeVersionId)
    : undefined;
  const activeVersionNumber = activeVersion?.versionNumber;

  const versionOptions = useMemo(
    () =>
      versions.map((v) => {
        const isPublished = v.id === activeVersionId;
        const isDraftVersion =
          activeVersionNumber !== undefined && v.versionNumber > activeVersionNumber;

        return {
          description: v.changeMessage || undefined,
          end: resolveConditional(
            isCodeSourceAgent,
            () => (
              <Badge variant={isPublished ? "success" : "info"}>
                {isPublished ? "当前" : "已保存"}
              </Badge>
            ),
            () =>
              resolveConditional(
                isPublished,
                () => <Badge variant="success">已发布</Badge>,
                () => (isDraftVersion ? <Badge variant="info">草稿</Badge> : undefined),
              ),
          ),
          label: `${isCodeSourceAgent ? "保存" : "v"}${v.versionNumber} - ${formatTimestamp(v.createdAt)}`,
          value: v.id,
        };
      }),
    [versions, activeVersionId, activeVersionNumber, isCodeSourceAgent],
  );

  const currentValue = selectedVersionId ?? latestVersion?.id ?? "";

  const saveDisabled = readOnly || !isDirty || isSavingDraft || isPublishing;
  const versionInfoText = isCodeSourceAgent
    ? "代码模式会将覆盖配置 JSON 写入文件系统支持的编辑器存储。此下拉列表显示该智能体已保存的覆盖配置快照。"
    : "更改会保存为草稿版本。准备就绪后，请发布一个版本，使其成为生产环境中使用的有效配置。";

  const handleSaveWithMessage = useCallback(async () => {
    if (isSavingDraft) {
      return;
    }
    const msg = changeMessage.trim();
    await onSaveDraft(msg || undefined);
    setShowMessageDialog(false);
    setChangeMessage("");
  }, [changeMessage, onSaveDraft, isSavingDraft]);

  return {
    actionBar: (
      <div className="flex items-center justify-end px-3 py-2 border-t border-border1 bg-surface3">
        {resolveConditional(
          showCodeModeActions,
          () => (
            <ButtonsGroup className="flex-wrap justify-end">
              <Button variant="default" size="md" onClick={() => void onDownloadJson?.()}>
                <Icon size="sm">
                  <Download />
                </Icon>
                下载 JSON
              </Button>
              {canOpenPr ? (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => void onOpenPr?.()}
                  title={openPrTitle}
                >
                  <Icon size="sm">
                    <GitPullRequest />
                  </Icon>
                  创建 PR
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => void onSaveDraft()}
                  disabled={saveDisabled}
                >
                  {isSavingDraft ? (
                    <>
                      <Spinner className="size-3.5" />
                      正在保存&hellip;
                    </>
                  ) : (
                    <>
                      <Icon size="sm">
                        <Save />
                      </Icon>
                      保存到文件系统
                    </>
                  )}
                </Button>
              )}
            </ButtonsGroup>
          ),
          () =>
            readOnly && !isViewingPreviousVersion ? null : (
              <ButtonsGroup className="flex-wrap justify-end">
                <ButtonsGroup spacing="close">
                  <Button
                    variant="default"
                    size="md"
                    onClick={() => onSaveDraft()}
                    disabled={saveDisabled}
                  >
                    {isSavingDraft ? (
                      <>
                        <Spinner className="size-3.5" />
                        正在保存&hellip;
                      </>
                    ) : (
                      <>
                        <Icon size="sm">
                          <Save />
                        </Icon>
                        保存新版本
                      </>
                    )}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenu.Trigger asChild>
                      <Button
                        variant="default"
                        size="md"
                        disabled={saveDisabled}
                        aria-label="更多保存选项"
                      >
                        <ChevronDown className="size-3.5" />
                      </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end">
                      <DropdownMenu.Item onSelect={() => setShowMessageDialog(true)}>
                        <Icon size="sm">
                          <MessageSquare />
                        </Icon>
                        保存并添加说明
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu>
                </ButtonsGroup>

                <Button
                  variant="primary"
                  size="md"
                  onClick={onPublish}
                  disabled={
                    isViewingPreviousVersion
                      ? selectedVersionId === activeVersionId || isPublishing || isSavingDraft
                      : readOnly || !hasDraft || isPublishing || isSavingDraft
                  }
                >
                  {isPublishing ? (
                    <>
                      <Spinner className="size-3.5" />
                      正在发布&hellip;
                    </>
                  ) : (
                    <>
                      <Icon size="sm">
                        <Check />
                      </Icon>
                      {isViewingPreviousVersion ? "发布此版本" : "发布"}
                    </>
                  )}
                </Button>
              </ButtonsGroup>
            ),
        )}

        {/* Change message dialog */}
        <Dialog open={showMessageDialog} onOpenChange={setShowMessageDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>保存新版本</DialogTitle>
              <DialogDescription>添加说明，描述此版本中的更改。</DialogDescription>
            </DialogHeader>
            <DialogBody className="py-1">
              <div className="grid gap-2">
                <Label htmlFor="change-message">更改说明</Label>
                <Input
                  id="change-message"
                  placeholder="描述更改内容..."
                  value={changeMessage}
                  className="focus:ring-white/50"
                  onChange={(e) => setChangeMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void handleSaveWithMessage();
                    }
                  }}
                  disabled={isSavingDraft}
                  autoFocus
                />
              </div>
            </DialogBody>
            <DialogFooter className="px-6">
              <Button variant="default" size="sm" onClick={() => setShowMessageDialog(false)}>
                取消
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveWithMessage}
                disabled={isSavingDraft}
              >
                <Icon size="sm">
                  <Save />
                </Icon>
                保存版本
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    ),
    versionSelector: (
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border1 bg-surface3">
        {versions.length > 0 ? (
          <Combobox
            options={versionOptions}
            value={currentValue}
            onValueChange={onVersionSelect}
            placeholder="选择版本..."
            variant="ghost"
            className="min-w-0 flex-1"
          />
        ) : (
          <Txt variant="ui-xs" className="text-neutral3">
            {isCodeSourceAgent ? "尚无文件系统保存记录" : "尚无版本"}
          </Txt>
        )}

        {resolveConditional(
          currentValue,
          (conditionValue) => (
            <CopyButton content={conditionValue} tooltip="复制版本 ID" size="sm" />
          ),
          () => null,
        )}

        <HoverPopover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="版本信息"
              className="text-neutral3 hover:text-neutral5 transition-colors shrink-0 rounded-sm focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-white/30"
            >
              <Icon size="sm">
                <Info />
              </Icon>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56">
            <Txt variant="ui-sm" className="text-neutral3">
              {versionInfoText}
            </Txt>
          </PopoverContent>
        </HoverPopover>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {resolveConditional(
            readOnly,
            () => (
              <Badge variant="warning">只读</Badge>
            ),
            () => null,
          )}
          {resolveConditional(
            !readOnly && hasDraft && !isCodeSourceAgent,
            () => (
              <Badge variant="info">未发布</Badge>
            ),
            () => null,
          )}
        </div>
      </div>
    ),
  };
}
