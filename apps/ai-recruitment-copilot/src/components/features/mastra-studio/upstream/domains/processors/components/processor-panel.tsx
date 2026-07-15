import { jsonLanguage } from "@codemirror/lang-json";
import { Badge } from "@mastra/playground-ui/components/Badge";
import { Button } from "@mastra/playground-ui/components/Button";
import { useCodemirrorTheme } from "@mastra/playground-ui/components/CodeEditor";
import { CopyButton } from "@mastra/playground-ui/components/CopyButton";
import { MainContentContent } from "@mastra/playground-ui/components/MainContent";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mastra/playground-ui/components/Select";
import { Skeleton } from "@mastra/playground-ui/components/Skeleton";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { toast } from "@mastra/playground-ui/utils/toast";
import CodeMirror from "@uiw/react-codemirror";
import { useState, useId, useEffect } from "react";
import type {
  ProcessorDetail,
  ProcessorPhase,
  MastraDBMessage,
  ExecuteProcessorResponse,
} from "../hooks/use-processors";
import { useProcessor, useExecuteProcessor } from "../hooks/use-processors";

export interface ProcessorPanelProps {
  processorId: string;
}

export interface ProcessorDetailPanelProps {
  processor: ProcessorDetail;
}

interface ProcessorInformationProps {
  processor: ProcessorDetail;
}

const PHASE_LABELS: Record<ProcessorPhase, string> = {
  input: "输入 - 在 LLM 之前处理输入消息（开始时执行一次）",
  inputStep: "输入步骤 - 在每次智能体循环步骤中处理",
  outputResult: "输出结果 - 在流式传输后处理完整输出",
  outputStep: "输出步骤 - 在每次 LLM 响应后、工具调用前处理",
  outputStream: "输出流 - 处理流式数据块",
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "发生错误";
}

function ProcessorInformation({ processor }: ProcessorInformationProps) {
  return (
    <div className="px-5 pt-5 pb-4 border-b border-border1">
      <Txt variant="header-md" className="text-neutral1 mb-2">
        {processor.name || processor.id}
      </Txt>
      {processor.name && processor.name !== processor.id && (
        <Txt variant="ui-sm" className="text-neutral4 mb-3">
          {processor.id}
        </Txt>
      )}
      <div className="flex flex-wrap gap-1 mt-3">
        {processor.phases.map((phase) => (
          <Badge key={phase} variant="default">
            {phase}
          </Badge>
        ))}
      </div>
      <div className="mt-3">
        <Txt variant="ui-xs" className="text-neutral4">
          已关联 {processor.configurations.length} 个智能体
        </Txt>
      </div>
    </div>
  );
}

function ProcessorDetailPanel({ processor }: ProcessorDetailPanelProps) {
  const theme = useCodemirrorTheme();
  const formId = useId();

  const [selectedPhase, setSelectedPhase] = useState<ProcessorPhase>(
    processor.phases[0] || "input",
  );
  const [selectedAgentId, setSelectedAgentId] = useState<string>(
    processor.configurations[0]?.agentId || "",
  );
  const [testMessage, setTestMessage] = useState("你好，这是一条测试消息。");
  const [result, setResult] = useState<ExecuteProcessorResponse | null>(null);
  const [errorString, setErrorString] = useState<string | undefined>();

  const executeProcessor = useExecuteProcessor();

  const handleExecute = async () => {
    setErrorString(undefined);
    setResult(null);

    // For output phases (outputStep, outputResult), use 'assistant' role since
    // processors receive assistant messages for those phases in real usage
    const isOutputPhase = selectedPhase === "outputStep" || selectedPhase === "outputResult";
    const messageRole = isOutputPhase ? "assistant" : "user";

    const messages: MastraDBMessage[] = [
      {
        content: {
          format: 2,
          parts: [{ text: testMessage, type: "text" }],
        },
        createdAt: new Date(),
        id: crypto.randomUUID(),
        role: messageRole,
      },
    ];

    try {
      const response = await executeProcessor.mutateAsync({
        agentId: selectedAgentId || undefined,
        messages,
        phase: selectedPhase,
        processorId: processor.id,
      });
      setResult(response);

      if (!response.success && response.error) {
        setErrorString(response.error);
      }
    } catch (error: unknown) {
      setErrorString(getErrorMessage(error));
    }
  };

  const resultCode = result ? JSON.stringify(result, null, 2) : "{}";

  return (
    <MainContentContent hasLeftServiceColumn={true} className="relative">
      <div className="bg-surface2 border-r border-border1 w-[22rem] overflow-y-auto">
        <ProcessorInformation processor={processor} />

        <div className="p-5 space-y-5">
          <div className="space-y-2">
            <Txt as="span" variant="ui-sm" className="text-neutral3">
              阶段
            </Txt>
            <Select
              value={selectedPhase}
              onValueChange={(v) => setSelectedPhase(v as ProcessorPhase)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择阶段" />
              </SelectTrigger>
              <SelectContent>
                {processor.phases.map((phase) => (
                  <SelectItem key={phase} value={phase}>
                    {phase}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Txt variant="ui-xs" className="text-neutral4">
              {PHASE_LABELS[selectedPhase]}
            </Txt>
          </div>

          {processor.configurations.length > 1 && (
            <div className="space-y-2">
              <Txt as="span" variant="ui-sm" className="text-neutral3">
                智能体配置
              </Txt>
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择智能体" />
                </SelectTrigger>
                <SelectContent>
                  {processor.configurations.map((config) => (
                    <SelectItem key={config.agentId} value={config.agentId}>
                      {config.agentName} ({config.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <label htmlFor={formId} className="block space-y-2 text-ui-sm text-neutral3">
            <span>测试消息</span>
            <textarea
              aria-label="测试消息"
              id={formId}
              value={testMessage}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setTestMessage(e.target.value)
              }
              placeholder="输入测试消息..."
              rows={4}
              className="w-full bg-transparent border border-border1 rounded-md p-3 text-ui-sm text-neutral6 placeholder:text-neutral3 focus:outline-hidden focus:ring-2 focus:ring-accent1"
            />
          </label>

          <Button
            onClick={handleExecute}
            disabled={executeProcessor.isPending || selectedPhase === "outputStream"}
            className="w-full"
          >
            {executeProcessor.isPending ? "运行中..." : "运行处理器"}
          </Button>

          {selectedPhase === "outputStream" && (
            <Txt variant="ui-xs" className="text-accent6">
              输出流阶段无法直接执行，请改用流式传输。
            </Txt>
          )}

          {result && (
            <div className="space-y-2 pt-4 border-t border-border1">
              <Txt variant="ui-sm" className="text-neutral3">
                状态
              </Txt>
              <div className="flex items-center gap-2">
                <Badge variant={result.success ? "success" : "error"}>
                  {result.success ? "成功" : "失败"}
                </Badge>
                {result.tripwire?.triggered && <Badge variant="info">已触发拦截器</Badge>}
              </div>
              {result.tripwire?.triggered && result.tripwire.reason && (
                <div className="mt-2 p-3 bg-accent6Dark rounded-md border border-accent6/20">
                  <Txt variant="ui-sm" className="text-accent6 font-medium">
                    拦截原因
                  </Txt>
                  <Txt variant="ui-sm" className="text-neutral3 mt-1">
                    {result.tripwire.reason}
                  </Txt>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10">
        <CopyButton content={resultCode} tooltip="复制 JSON 结果到剪贴板" />
      </div>

      <div className="p-5 h-full relative overflow-x-auto overflow-y-auto">
        <CodeMirror
          value={errorString || resultCode}
          editable={true}
          theme={theme}
          extensions={[jsonLanguage]}
        />
      </div>
    </MainContentContent>
  );
}

export function ProcessorPanel({ processorId }: ProcessorPanelProps) {
  const { data: processor, isLoading, error } = useProcessor(processorId);

  useEffect(() => {
    if (error) {
      toast.error(`加载处理器时出错：${getErrorMessage(error)}`);
    }
  }, [error]);

  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return null;
  }

  if (!processor) {
    return (
      <div className="py-12 text-center px-6">
        <Txt variant="header-md" className="text-neutral3">
          未找到处理器
        </Txt>
      </div>
    );
  }

  return <ProcessorDetailPanel processor={processor} />;
}
