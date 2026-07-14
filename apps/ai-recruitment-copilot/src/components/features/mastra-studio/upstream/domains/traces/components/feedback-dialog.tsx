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

export function FeedbackDialog({
  feedback,
  isOpen,
  onClose,
  onNext,
  onPrevious,
}: FeedbackDialogProps) {
  const metadataStr =
    feedback?.metadata && Object.keys(feedback.metadata).length > 0
      ? JSON.stringify(feedback.metadata, null, 2)
      : undefined;

  return (
    <SideDialog
      dialogTitle="Feedback Detail"
      dialogDescription="View feedback details"
      isOpen={isOpen}
      onClose={onClose}
      level={3}
    >
      <SideDialog.Top>
        <TextAndIcon>
          <MessageSquareIcon /> Feedback
        </TextAndIcon>
        |
        <SideDialog.Nav onNext={onNext} onPrevious={onPrevious} />
      </SideDialog.Top>

      <SideDialog.Content>
        <SideDialog.Header>
          <SideDialog.Heading>
            <MessageSquareIcon /> Feedback
          </SideDialog.Heading>
          {feedback?.traceId && (
            <TextAndIcon>
              <HashIcon /> {feedback.traceId}
            </TextAndIcon>
          )}
        </SideDialog.Header>

        <Sections>
          <KeyValueList
            data={[
              {
                key: "timestamp",
                label: "Created at",
                value: feedback?.timestamp
                  ? format(new Date(feedback.timestamp), "MMM d, h:mm:ss aaa")
                  : "n/a",
              },
              {
                key: "type",
                label: "Type",
                value: feedback?.feedbackType ?? "n/a",
              },
              {
                key: "value",
                label: "Value",
                value: feedback ? formatValue(feedback) : "n/a",
              },
              ...(feedback?.comment
                ? [
                    {
                      key: "comment",
                      label: "Comment",
                      value: feedback.comment,
                    },
                  ]
                : []),
              {
                key: "source",
                label: "Source",
                value: feedback?.feedbackSource ?? feedback?.source ?? "n/a",
              },
              ...(feedback?.feedbackUserId
                ? [
                    {
                      key: "userId",
                      label: "User",
                      value: feedback.feedbackUserId,
                    },
                  ]
                : []),
              ...(feedback?.traceId
                ? [
                    {
                      key: "traceId",
                      label: "Trace ID",
                      value: feedback.traceId,
                    },
                  ]
                : []),
              ...(feedback?.spanId
                ? [
                    {
                      key: "spanId",
                      label: "Span ID",
                      value: feedback.spanId,
                    },
                  ]
                : []),
            ]}
          />

          {metadataStr && (
            <SideDialog.CodeSection
              title="Metadata"
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
