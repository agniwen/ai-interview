import type { StoredMCPServerConfig } from "@mastra/client-js";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import { getEmbeddedMastraApiUrl } from "@/components/features/mastra-studio/mastra-studio-config";

import { useTryConnectMcp } from "../../hooks/use-try-connect-mcp";
import { MCPClientEditLayout } from "./mcp-client-edit-layout";
import { MCPClientFormSidebar } from "./mcp-client-form-sidebar";
import { MCPClientToolPreview } from "./mcp-client-tool-preview";
import { useMCPClientForm } from "./use-mcp-client-form";
import type { MCPClientFormValues } from "./use-mcp-client-form";

interface MCPClientCreateContentProps {
  onAdd?: (config: {
    name: string;
    description?: string;
    servers: Record<string, StoredMCPServerConfig>;
    selectedTools: Record<string, { description?: string }>;
  }) => void;
  readOnly?: boolean;
  initialValues?: MCPClientFormValues;
  initialSelectedTools?: Record<string, { description?: string }>;
  submitLabel?: string;
}

export function MCPClientCreateContent({
  onAdd,
  readOnly,
  initialValues,
  initialSelectedTools,
  submitLabel,
}: MCPClientCreateContentProps) {
  const { form } = useMCPClientForm(initialValues);
  const containerRef = useRef<HTMLDivElement>(null);

  const serverType = useWatch({ control: form.control, name: "serverType" });
  const url = useWatch({ control: form.control, name: "url" });

  const [selectedTools, setSelectedTools] = useState<Record<string, { description?: string }>>(
    initialSelectedTools ?? {},
  );

  const tryConnect = useTryConnectMcp();
  const hasAutoConnected = useRef(false);

  useEffect(() => {
    if (readOnly && serverType === "http" && url.trim() && !hasAutoConnected.current) {
      hasAutoConnected.current = true;
      tryConnect.mutate(url);
    }
  }, [readOnly, serverType, url, tryConnect]);

  const handleTryConnect = useCallback(() => {
    if (serverType === "http" && url.trim()) {
      tryConnect.mutate(url);
    }
  }, [serverType, url, tryConnect]);

  const handleToggleTool = useCallback((toolName: string, description?: string) => {
    setSelectedTools((prev) => {
      if (toolName in prev) {
        return Object.fromEntries(Object.entries(prev).filter(([name]) => name !== toolName));
      }
      return { ...prev, [toolName]: { description } };
    });
  }, []);

  const handleDescriptionChange = useCallback((toolName: string, description: string) => {
    setSelectedTools((prev) => ({
      ...prev,
      [toolName]: { ...prev[toolName], description },
    }));
  }, []);

  const handlePreFillFromServer = (serverId: string) => {
    const serverUrl = getEmbeddedMastraApiUrl(`/mcp/${serverId}/mcp`);

    form.setValue("serverType", "http");
    form.setValue("url", serverUrl);
    form.setValue("serverName", serverId);
  };

  const handlePublish = async () => {
    if (!onAdd) {
      return;
    }

    const isValid = await form.trigger();
    if (!isValid) {
      toast.error("请填写所有必填字段");
      return;
    }

    const values = form.getValues();
    const environment: Record<string, string> = {};
    for (const { key, value } of values.env) {
      if (key.trim()) {
        environment[key.trim()] = value;
      }
    }

    const serverConfig: Record<string, StoredMCPServerConfig> = {
      [values.serverName]: {
        type: values.serverType,
        ...(values.serverType === "http"
          ? {
              timeout: values.timeout,
              url: values.url,
            }
          : {
              args: values.args
                .split("\n")
                .map((a) => a.trim())
                .filter(Boolean),
              command: values.command,
              env: environment,
            }),
      },
    };

    onAdd({
      description: values.description || undefined,
      name: values.name,
      selectedTools,
      servers: serverConfig,
    });
  };

  return (
    <div ref={containerRef} className="h-full min-h-0 overflow-hidden">
      <MCPClientEditLayout
        leftSlot={
          <MCPClientFormSidebar
            form={form}
            onPublish={handlePublish}
            isSubmitting={false}
            onPreFillFromServer={handlePreFillFromServer}
            containerRef={containerRef}
            readOnly={readOnly}
            showSubmit={!!onAdd}
            submitLabel={submitLabel}
            onTryConnect={handleTryConnect}
            isTryingConnect={tryConnect.isPending}
          />
        }
      >
        <MCPClientToolPreview
          serverType={serverType}
          url={url}
          tryConnect={tryConnect}
          selectedTools={selectedTools}
          onToggleTool={onAdd ? handleToggleTool : undefined}
          onDescriptionChange={onAdd ? handleDescriptionChange : undefined}
        />
      </MCPClientEditLayout>
    </div>
  );
}
