import type { FeedbackRecord } from "@mastra/core/storage";
import { KeyValueList } from "@mastra/playground-ui/components/KeyValueList";
import { Sections } from "@mastra/playground-ui/components/Sections";
import { SideDialog } from "@mastra/playground-ui/components/SideDialog";
import { TextAndIcon } from "@mastra/playground-ui/components/Text";
import { format } from "date-fns/format";
import { HashIcon, MessageSquareIcon } from "lucide-react";

interface FeedbackDialogProps {
  feedback?: FeedbackRecord;
  isOpen: boolean;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
}

function formatValue(fb: FeedbackRecord): string {
  if (fb.feedbackType === "thumbs") {
    if (fb.value === 1) {
      return "\u{1F44D} Positive (1)";
    }
    if (fb.value === 0 || fb.value === -1) {
      return "\u{1F44E} Negative";
    }
    return String(fb.value);
  }
  if (fb.feedbackType === "rating") {
    return String(fb.value);
  }
  if (fb.feedbackType === "comment") {
    return String(fb.value ?? fb.comment ?? "-");
  }
  return String(fb.value ?? "-");
}

function buildFeedbackData(feedback?: FeedbackRecord) {
  const data = [
    {
      key: "timestamp",
      label: "创建时间",
      value: feedback?.timestamp
        ? format(new Date(feedback.timestamp), "MM/dd HH:mm:ss")
        : "不适用",
    },
    {
      key: "type",
      label: "类型",
      value: feedback?.feedbackType ?? "不适用",
    },
    {
      key: "value",
      label: "值",
      value: feedback ? formatValue(feedback) : "不适用",
    },
  ];

  if (feedback?.comment) {
    data.push({ key: "comment", label: "备注", value: feedback.comment });
  }

  data.push({
    key: "source",
    label: "来源",
    value: feedback?.feedbackSource ?? feedback?.source ?? "不适用",
  });

  if (feedback?.feedbackUserId) {
    data.push({ key: "userId", label: "用户", value: feedback.feedbackUserId });
  }
  if (feedback?.traceId) {
    data.push({ key: "traceId", label: "追踪 ID", value: feedback.traceId });
  }
  if (feedback?.spanId) {
    data.push({ key: "spanId", label: "Span ID", value: feedback.spanId });
  }

  return data;
}

function getMetadataString(feedback?: FeedbackRecord) {
  if (!feedback?.metadata || Object.keys(feedback.metadata).length === 0) {
    return;
  }
  return JSON.stringify(feedback.metadata, null, 2);
}

export function FeedbackDialog({
  feedback,
  isOpen,
  onClose,
  onNext,
  onPrevious,
}: FeedbackDialogProps) {
  const metadataStr = getMetadataString(feedback);

  return (
    <SideDialog
      dialogTitle="反馈详情"
      dialogDescription="查看反馈详情"
      isOpen={isOpen}
      onClose={onClose}
      level={3}
    >
      <SideDialog.Top>
        <TextAndIcon>
          <MessageSquareIcon /> 反馈
        </TextAndIcon>
        |
        <SideDialog.Nav onNext={onNext} onPrevious={onPrevious} />
      </SideDialog.Top>

      <SideDialog.Content>
        <SideDialog.Header>
          <SideDialog.Heading>
            <MessageSquareIcon /> 反馈
          </SideDialog.Heading>
          {feedback?.traceId && (
            <TextAndIcon>
              <HashIcon /> {feedback.traceId}
            </TextAndIcon>
          )}
        </SideDialog.Header>

        <Sections>
          <KeyValueList data={buildFeedbackData(feedback)} />

          {metadataStr && (
            <SideDialog.CodeSection
              title="元数据"
              icon={<HashIcon />}
              codeStr={metadataStr}
              simplified={true}
            />
          )}
        </Sections>
      </SideDialog.Content>
    </SideDialog>
  );
}
