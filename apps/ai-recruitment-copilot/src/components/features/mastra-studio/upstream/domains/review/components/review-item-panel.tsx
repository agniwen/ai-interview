import { AlertDialog } from "@mastra/playground-ui/components/AlertDialog";
import { Badge } from "@mastra/playground-ui/components/Badge";
import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { DataKeysAndValues } from "@mastra/playground-ui/components/DataKeysAndValues";
import { DataPanel } from "@mastra/playground-ui/components/DataPanel";
import { Textarea } from "@mastra/playground-ui/components/Textarea";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import {
  CheckCircle,
  FileInputIcon,
  FileOutputIcon,
  GaugeIcon,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import type { ReviewItem } from "./review-item-card";
import { TagPicker } from "./tag-picker";
function formatUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export interface ReviewItemPanelProps {
  item: ReviewItem;
  isCompleted?: boolean;
  tagVocabulary: string[];
  onRate: (rating: "positive" | "negative" | undefined) => void;
  onSetTags: (tags: string[]) => void;
  onComment: (comment: string) => void;
  onRemove: () => void;
  onComplete?: () => void | Promise<void>;
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
}

export function ReviewItemPanel({
  item,
  isCompleted,
  tagVocabulary,
  onRate,
  onSetTags,
  onComment,
  onRemove,
  onComplete,
  onPrevious,
  onNext,
  onClose,
}: ReviewItemPanelProps) {
  const [localComment, setLocalComment] = useState(item.comment || "");
  const [commentSaved, setCommentSaved] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const previousItemIdRef = useRef(item.id);

  useEffect(() => {
    if (previousItemIdRef.current === item.id) {
      return;
    }
    previousItemIdRef.current = item.id;
    setLocalComment(item.comment || "");
    setCommentSaved(false);
    setShowRemoveConfirm(false);
  }, [item.comment, item.id]);

  const commentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (commentTimerRef.current) {
        clearTimeout(commentTimerRef.current);
      }
    },
    [],
  );

  const handleCommentBlur = () => {
    if (localComment !== (item.comment || "")) {
      onComment(localComment);
      setCommentSaved(true);
      if (commentTimerRef.current) {
        clearTimeout(commentTimerRef.current);
      }
      commentTimerRef.current = setTimeout(() => setCommentSaved(false), 1500);
    }
  };

  const renderMetadata = () => (
    <div className="grid gap-4 mb-6">
      {/* Rating */}
      {!isCompleted && (
        <div className="flex items-center gap-2">
          <Txt variant="ui-sm" className="text-neutral3">
            评级
          </Txt>
          <ButtonsGroup spacing="close">
            <Button
              size="md"
              onClick={() => onRate(item.rating === "positive" ? undefined : "positive")}
              aria-label="评为良好"
            >
              <Icon size="sm" className={item.rating === "positive" ? "text-positive1" : ""}>
                <ThumbsUp />
              </Icon>
            </Button>
            <Button
              size="md"
              onClick={() => onRate(item.rating === "negative" ? undefined : "negative")}
              aria-label="评为较差"
            >
              <Icon size="sm" className={item.rating === "negative" ? "text-negative1" : ""}>
                <ThumbsDown />
              </Icon>
            </Button>
          </ButtonsGroup>
          {item.rating && (
            <Badge variant={item.rating === "positive" ? "success" : "error"}>
              {item.rating === "positive" ? "良好" : "较差"}
            </Badge>
          )}
        </div>
      )}

      {isCompleted && item.rating && (
        <div className="flex items-center gap-2">
          <Txt variant="ui-sm" className="text-neutral3">
            评级
          </Txt>
          <Badge variant={item.rating === "positive" ? "success" : "error"}>
            {item.rating === "positive" ? "良好" : "较差"}
          </Badge>
        </div>
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        <Txt variant="ui-sm" className="text-neutral3 block mt-0">
          标签
        </Txt>
        {isCompleted ? (
          <div className="flex gap-1 flex-wrap">
            {item.tags.length > 0 ? (
              item.tags.map((tag) => (
                <Badge key={tag} variant="default">
                  {tag}
                </Badge>
              ))
            ) : (
              <Txt variant="ui-sm" className="text-neutral2">
                无标签
              </Txt>
            )}
          </div>
        ) : (
          <TagPicker tags={item.tags} vocabulary={tagVocabulary} onSetTags={onSetTags} />
        )}
      </div>

      {/* Scores */}
      {item.scores && Object.keys(item.scores).length > 0 && (
        <div>
          <Txt variant="ui-xs" className="text-neutral3 block mb-2">
            得分
          </Txt>
          <div className="flex flex-wrap gap-2">
            {Object.entries(item.scores).map(([name, score]) => (
              <div key={name} className="flex items-center gap-1">
                <Icon size="sm" className="text-neutral3">
                  <GaugeIcon />
                </Icon>
                <Txt variant="ui-xs" className="text-neutral4">
                  {name}:
                </Txt>
                <Badge variant={score >= 0.5 ? "success" : "error"}>{score.toFixed(3)}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {item.experimentId && (
        <DataKeysAndValues>
          <DataKeysAndValues.Key>实验 ID</DataKeysAndValues.Key>
          <DataKeysAndValues.ValueWithCopyBtn
            copyTooltip="复制实验 ID 到剪贴板"
            copyValue={item.experimentId}
          >
            {item.experimentId}
          </DataKeysAndValues.ValueWithCopyBtn>
        </DataKeysAndValues>
      )}
    </div>
  );

  return (
    <>
      <DataPanel>
        <DataPanel.Header>
          <DataPanel.Heading>评审</DataPanel.Heading>
          <ButtonsGroup className="ml-auto shrink-0">
            <DataPanel.NextPrevNav
              onPrevious={onPrevious}
              onNext={onNext}
              previousLabel="上一项"
              nextLabel="下一项"
            />
            {!isCompleted && onComplete && (
              <Button size="md" onClick={onComplete} aria-label="标记为已完成">
                <CheckCircle />
                完成
              </Button>
            )}
            <DataPanel.CloseButton onClick={onClose} tooltip="关闭详情面板" />
          </ButtonsGroup>
        </DataPanel.Header>

        <DataPanel.Content>
          {renderMetadata()}

          <div className="grid gap-3">
            <DataPanel.CodeSection
              title="输入"
              icon={<FileInputIcon />}
              codeStr={formatUnknown(item.input ?? null)}
            />
            <DataPanel.CodeSection
              title="输出"
              icon={<FileOutputIcon />}
              codeStr={formatUnknown(item.output ?? null)}
            />
          </div>

          {/* Error */}
          {item.error !== null && (
            <div>
              <Txt variant="ui-xs" className="text-neutral3 block mb-1">
                错误
              </Txt>
              <pre className="text-ui-xs text-negative1 whitespace-pre-wrap wrap-break-word bg-surface2 rounded-md p-3 max-h-48 overflow-auto">
                {formatUnknown(item.error)}
              </pre>
            </div>
          )}

          {/* Comment */}
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <Txt variant="ui-sm" className="uppercase tracking-widest text-neutral2">
                备注
              </Txt>
              {commentSaved && (
                <Txt variant="ui-xs" className="text-positive1">
                  已保存
                </Txt>
              )}
            </div>
            {isCompleted ? (
              <Txt variant="ui-xs" className="text-neutral4 block">
                {item.comment || "无备注"}
              </Txt>
            ) : (
              <Textarea
                value={localComment}
                onChange={(e) => setLocalComment(e.target.value)}
                onBlur={handleCommentBlur}
                placeholder="添加关于此数据项的备注…"
                rows={3}
                className="text-xs"
              />
            )}
          </div>

          {/* Actions */}
          {!isCompleted && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border1">
              {onComplete && (
                <Button size="md" onClick={onComplete}>
                  <CheckCircle />
                  标记为已完成
                </Button>
              )}
              <Button variant="outline" size="md" onClick={() => setShowRemoveConfirm(true)}>
                <Trash2 />
                移除
              </Button>
            </div>
          )}
        </DataPanel.Content>
      </DataPanel>

      <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>从评审中移除</AlertDialog.Title>
            <AlertDialog.Description>
              此操作会将数据项移出评审队列。实验结果仍会保留，但不再标记为待评审。
            </AlertDialog.Description>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel>取消</AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={() => {
                onRemove();
                setShowRemoveConfirm(false);
              }}
            >
              移除
            </AlertDialog.Action>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog>
    </>
  );
}
