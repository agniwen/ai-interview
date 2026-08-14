import { Badge } from "@mastra/playground-ui/components/Badge";
import { Button } from "@mastra/playground-ui/components/Button";
import { Textarea } from "@mastra/playground-ui/components/Textarea";
import { TooltipProvider } from "@mastra/playground-ui/components/Tooltip";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { ThumbsUp, ThumbsDown, Trash2, CheckCircle } from "lucide-react";
import { useState } from "react";
import { TagPicker } from "./tag-picker";
import type { ReviewItem } from "@/components/features/mastra-studio/upstream/domains/agents/context/review-queue-context";

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

function ReviewTags({
  isCompleted,
  item,
  onSetTags,
  tagVocabulary,
}: {
  isCompleted: boolean;
  item: ReviewItem;
  onSetTags: (tags: string[]) => void;
  tagVocabulary: string[];
}) {
  if (isCompleted) {
    if (item.tags.length === 0) {
      return null;
    }
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {item.tags.map((tag) => (
          <Badge key={tag} variant="default">
            {tag}
          </Badge>
        ))}
      </div>
    );
  }

  return <TagPicker tags={item.tags} vocabulary={tagVocabulary} onSetTags={onSetTags} />;
}

function ReviewComment({
  isCompleted,
  item,
  localComment,
  onComment,
  setCommentSaved,
  setLocalComment,
}: {
  isCompleted: boolean;
  item: ReviewItem;
  localComment: string;
  onComment: (comment: string) => void;
  setCommentSaved: (saved: boolean) => void;
  setLocalComment: (comment: string) => void;
}) {
  if (isCompleted) {
    if (item.comment) {
      return (
        <Txt variant="ui-xs" className="text-neutral4">
          {item.comment}
        </Txt>
      );
    }
    return (
      <Txt variant="ui-xs" className="text-neutral2 italic">
        暂无评论
      </Txt>
    );
  }

  return (
    <Textarea
      value={localComment}
      onChange={(event) => {
        setLocalComment(event.target.value);
        setCommentSaved(false);
      }}
      onBlur={() => {
        if (localComment !== (item.comment || "")) {
          onComment(localComment);
          setCommentSaved(true);
          setTimeout(() => setCommentSaved(false), 2000);
        }
      }}
      placeholder="出现了什么问题？应该如何处理？"
      rows={2}
    />
  );
}

function ReviewRatingButtons({
  isCompleted,
  item,
  onRate,
}: {
  isCompleted: boolean;
  item: ReviewItem;
  onRate: (rating: "positive" | "negative" | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 mr-1">
      <Button
        tooltip="良好——此结果可以接受"
        variant={item.rating === "positive" ? "default" : "ghost"}
        size="sm"
        onClick={() => onRate(item.rating === "positive" ? undefined : "positive")}
        disabled={isCompleted}
      >
        <Icon size="sm" className={item.rating === "positive" ? "text-positive1" : ""}>
          <ThumbsUp />
        </Icon>
      </Button>
      <Button
        tooltip="不佳——此结果有误"
        variant={item.rating === "negative" ? "default" : "ghost"}
        size="sm"
        onClick={() => onRate(item.rating === "negative" ? undefined : "negative")}
        disabled={isCompleted}
      >
        <Icon size="sm" className={item.rating === "negative" ? "text-negative1" : ""}>
          <ThumbsDown />
        </Icon>
      </Button>
    </div>
  );
}

export function ReviewItemCard({
  item,
  isExpanded,
  isSelected,
  isCompleted,
  onToggleSelect,
  onToggleExpand,
  onRate,
  onSetTags,
  onComment,
  onRemove,
  onComplete,
  tagVocabulary,
  extraHeader,
}: {
  item: ReviewItem;
  isExpanded: boolean;
  isSelected: boolean;
  isCompleted?: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onRate: (rating: "positive" | "negative" | undefined) => void;
  onSetTags: (tags: string[]) => void;
  onComment: (comment: string) => void;
  onRemove: () => void;
  onComplete?: () => void | Promise<void>;
  tagVocabulary: string[];
  /** Optional extra content rendered in the header row (e.g., experiment/target info) */
  extraHeader?: React.ReactNode;
}) {
  const [localComment, setLocalComment] = useState(item.comment || "");
  const [commentSaved, setCommentSaved] = useState(false);

  const inputPreview = (() => {
    try {
      if (typeof item.input === "string") {
        return item.input.slice(0, 80);
      }
      return JSON.stringify(item.input).slice(0, 80);
    } catch {
      return String(item.input).slice(0, 80);
    }
  })();

  const scoresEntries: [string, number][] = item.scores
    ? (Object.entries(item.scores) as [string, number][])
    : [];

  return (
    <div
      className={cn(
        "border border-border1 rounded-lg p-3 transition-colors",
        isSelected && "ring-1 ring-accent1",
        item.tags.length > 0 && "border-l-2 border-l-accent1",
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        {isCompleted ? (
          <Icon size="sm" className="text-positive1 shrink-0">
            <CheckCircle />
          </Icon>
        ) : (
          <input
            aria-label="选择评审项"
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="w-3.5 h-3.5 rounded border-border1 accent-accent1"
          />
        )}
        <button type="button" onClick={onToggleExpand} className="flex-1 text-left min-w-0">
          <Txt variant="ui-xs" className="text-neutral4 truncate block">
            {inputPreview}
          </Txt>
        </button>
        {extraHeader}
      </div>

      {/* Error indicator */}
      {Boolean(item.error) && (
        <Txt variant="ui-xs" className="text-negative1 mt-1 block truncate">
          错误：{typeof item.error === "string" ? item.error : "失败"}
        </Txt>
      )}

      {/* Rating + Tags + Remove row */}
      <TooltipProvider delayDuration={200}>
        <div className="flex items-center gap-2 mt-2">
          {/* Rating: thumbs up / down */}
          <ReviewRatingButtons isCompleted={Boolean(isCompleted)} item={item} onRate={onRate} />

          {/* Tags */}
          <div className="flex-1 min-w-0">
            <ReviewTags
              isCompleted={Boolean(isCompleted)}
              item={item}
              onSetTags={onSetTags}
              tagVocabulary={tagVocabulary}
            />
          </div>

          {!isCompleted && (
            <>
              <Button
                tooltip={
                  item.tags.length > 0 || item.comment ? "标记为已完成" : "完成前请添加标签或评论"
                }
                variant="ghost"
                size="sm"
                onClick={onComplete}
                disabled={item.tags.length === 0 && !item.comment}
              >
                <Icon
                  size="sm"
                  className={
                    item.tags.length > 0 || item.comment ? "text-positive1" : "text-neutral3"
                  }
                >
                  <CheckCircle />
                </Icon>
              </Button>

              <Button tooltip="从评审队列中删除" variant="ghost" size="sm" onClick={onRemove}>
                <Icon size="sm" className="text-neutral3">
                  <Trash2 />
                </Icon>
              </Button>
            </>
          )}
        </div>
      </TooltipProvider>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-3 pt-2 border-t border-border1 space-y-2">
          {/* Scores */}
          {scoresEntries.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {scoresEntries.map(([scorerId, score]) => (
                <Badge key={scorerId} variant={score >= 0.5 ? "success" : "error"}>
                  {scorerId.slice(0, 12)}: {score.toFixed(3)}
                </Badge>
              ))}
            </div>
          )}

          {/* Input */}
          <div>
            <Txt variant="ui-xs" className="text-neutral3 font-medium block mb-1">
              输入
            </Txt>
            <pre className="text-xs text-neutral4 bg-surface3 rounded px-3 py-2 overflow-x-auto whitespace-pre-wrap wrap-break-word max-h-24 overflow-y-auto">
              {formatUnknown(item.input)}
            </pre>
          </div>

          {/* Output / Error */}
          <div>
            <Txt variant="ui-xs" className="text-neutral3 font-medium block mb-1">
              {item.error ? "错误" : "输出"}
            </Txt>
            <pre
              className={cn(
                "text-xs rounded px-3 py-2 overflow-x-auto whitespace-pre-wrap wrap-break-word max-h-24 overflow-y-auto",
                item.error ? "text-negative1 bg-negative1/10" : "text-neutral4 bg-surface3",
              )}
            >
              {formatUnknown(item.error || item.output)}
            </pre>
          </div>

          {/* Comment */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Txt variant="ui-xs" className="text-neutral3 font-medium">
                评论
              </Txt>
              {commentSaved && (
                <Txt variant="ui-xs" className="text-positive1">
                  已保存
                </Txt>
              )}
            </div>
            <ReviewComment
              isCompleted={Boolean(isCompleted)}
              item={item}
              localComment={localComment}
              onComment={onComment}
              setCommentSaved={setCommentSaved}
              setLocalComment={setLocalComment}
            />
          </div>
        </div>
      )}
    </div>
  );
}
