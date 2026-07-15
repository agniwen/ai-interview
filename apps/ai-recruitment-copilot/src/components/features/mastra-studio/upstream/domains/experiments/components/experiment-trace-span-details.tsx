import type { SpanRecord } from "@mastra/core/storage";
import { SideDialog } from "@mastra/playground-ui/components/SideDialog";
import { BracesIcon, FileInputIcon, FileOutputIcon } from "lucide-react";

interface ExperimentTraceSpanDetailsProps {
  span?: SpanRecord;
}

export function ExperimentTraceSpanDetails({ span }: ExperimentTraceSpanDetailsProps) {
  if (!span) {
    return null;
  }

  return (
    <>
      <SideDialog.CodeSection
        title="输入"
        icon={<FileInputIcon />}
        codeStr={JSON.stringify(span.input || null, null, 2)}
      />
      <SideDialog.CodeSection
        title="输出"
        icon={<FileOutputIcon />}
        codeStr={JSON.stringify(span.output || null, null, 2)}
      />
      <SideDialog.CodeSection
        title="元数据"
        icon={<BracesIcon />}
        codeStr={JSON.stringify(span.metadata || null, null, 2)}
      />
      <SideDialog.CodeSection
        title="属性"
        icon={<BracesIcon />}
        codeStr={JSON.stringify(span.attributes || null, null, 2)}
      />
    </>
  );
}
