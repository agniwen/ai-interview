import { AlertDialog } from "@mastra/playground-ui/components/AlertDialog";
import { Button } from "@mastra/playground-ui/components/Button";
import { DialogBody } from "@mastra/playground-ui/components/Dialog";
import { Input } from "@mastra/playground-ui/components/Input";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { toast } from "@mastra/playground-ui/utils/toast";
import { ChevronLeft, Link2 } from "lucide-react";
import { useState } from "react";

import { useDisconnectConnection } from "../hooks/use-disconnect-connection";
import { titleize } from "./titleize";
import { useDebouncedConnectionRename } from "./use-debounced-connection-rename";

interface ManageConnectionFormProps {
  providerId: string;
  connectionId: string;
  initialLabel: string;
  iconUrl?: string;
  disabled: boolean;
  testIdPrefix: string;
  showBack: boolean;
  onBack: () => void;
  onDisconnected: (connectionId: string) => void;
}

export const ManageConnectionForm = ({
  providerId,
  connectionId,
  initialLabel,
  iconUrl,
  disabled,
  testIdPrefix,
  showBack,
  onBack,
  onDisconnected,
}: ManageConnectionFormProps) => {
  const rename = useDebouncedConnectionRename({ connectionId, initialLabel, providerId });
  const disconnectConnection = useDisconnectConnection();
  const [draft, setDraft] = useState(initialLabel);
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);
  const integrationName = titleize(providerId);

  const disconnect = () => {
    disconnectConnection.mutate(
      { connectionId, force: true, providerId },
      {
        onSuccess: () => {
          toast.success("连接已断开");
          onDisconnected(connectionId);
        },
      },
    );
  };

  return (
    <>
      <DialogBody className="flex flex-col gap-3">
        {showBack && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            aria-label="返回连接列表"
            data-testid={`${testIdPrefix}-back`}
            className="-mt-1 -ml-1.5 w-fit text-neutral3"
          >
            <Icon>
              <ChevronLeft />
            </Icon>
            连接
          </Button>
        )}
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="grid size-14 place-items-center overflow-hidden rounded-xl bg-surface4"
            aria-hidden
          >
            {iconUrl ? (
              <svg className="size-8" aria-hidden>
                <image
                  href={iconUrl}
                  width="100%"
                  height="100%"
                  preserveAspectRatio="xMidYMid meet"
                />
              </svg>
            ) : (
              <Icon size="lg" className="text-neutral3">
                <Link2 />
              </Icon>
            )}
          </div>

          <div className="flex w-full flex-col items-center gap-1.5">
            <Txt variant="ui-xs" className="text-neutral3">
              {integrationName} 连接
            </Txt>
            <div className="relative w-full">
              <Input
                id={`${testIdPrefix}-input`}
                variant="filled"
                size="sm"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  rename.scheduleRename(event.target.value);
                }}
                disabled={disabled || rename.isPending}
                placeholder="未命名连接"
                autoFocus
                aria-label="连接名称"
                testId={`${testIdPrefix}-input`}
                className="text-center"
              />
              {rename.isPending && (
                <span className="absolute top-1/2 right-2 -translate-y-1/2">
                  <Spinner size="sm" aria-label="正在保存" data-testid={`${testIdPrefix}-saving`} />
                </span>
              )}
            </div>
            {rename.error ? (
              <Txt variant="ui-xs" className="text-red-500">
                {String(rename.error)}
              </Txt>
            ) : null}
          </div>

          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirmDisconnectOpen(true)}
            disabled={disabled || disconnectConnection.isPending}
            data-testid={`${testIdPrefix}-disconnect`}
          >
            断开连接
          </Button>
        </div>
      </DialogBody>

      <AlertDialog open={confirmDisconnectOpen} onOpenChange={setConfirmDisconnectOpen}>
        <AlertDialog.Content data-testid={`${testIdPrefix}-disconnect-dialog`}>
          <AlertDialog.Header>
            <AlertDialog.Title>要断开连接吗？</AlertDialog.Title>
            <AlertDialog.Description>
              断开连接会撤销此授权账户并将其从 Mastra
              中移除。使用此连接的智能体将失去访问权限，且此操作无法撤销。
            </AlertDialog.Description>
          </AlertDialog.Header>
          {disconnectConnection.error ? (
            <Txt variant="ui-xs" className="text-red-500">
              {String(disconnectConnection.error)}
            </Txt>
          ) : null}
          <AlertDialog.Footer>
            <AlertDialog.Cancel
              data-testid={`${testIdPrefix}-disconnect-cancel`}
              disabled={disconnectConnection.isPending}
            >
              取消
            </AlertDialog.Cancel>
            <Button
              type="button"
              variant="primary"
              onClick={disconnect}
              disabled={disabled || disconnectConnection.isPending}
              data-testid={`${testIdPrefix}-disconnect-confirm`}
            >
              {disconnectConnection.isPending ? "正在断开…" : "断开连接"}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog>
    </>
  );
};
