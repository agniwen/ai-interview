import { useMastraClient } from "@mastra/react";
import { useState, useEffect, useCallback } from "react";
import { usePlaygroundStore } from "@/components/features/mastra-studio/upstream/store/playground-store";

function parseJsonString(jsonString: string): string {
  try {
    return JSON.stringify(JSON.parse(jsonString), null, 2);
  } catch {
    return jsonString;
  }
}

export function useAgentWorkingMemory(agentId: string, threadId: string, resourceId: string) {
  const client = useMastraClient();
  const [threadExists, setThreadExists] = useState(false);
  const [workingMemoryData, setWorkingMemoryData] = useState<string | null>(null);
  const [workingMemorySource, setWorkingMemorySource] = useState<"thread" | "resource">("thread");
  const [workingMemoryFormat, setWorkingMemoryFormat] = useState<"json" | "markdown">("markdown");
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const { requestContext } = usePlaygroundStore();

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!agentId || !threadId) {
        setWorkingMemoryData(null);
        setIsLoading(false);
        return;
      }
      const res = await client.getWorkingMemory({ agentId, requestContext, resourceId, threadId });
      const {
        workingMemory,
        source,
        workingMemoryTemplate,
        threadExists: responseThreadExists,
      } = res as {
        workingMemory: string | null;
        source: "thread" | "resource";
        workingMemoryTemplate: { content: string; format: "json" | "markdown" };
        threadExists: boolean;
      };
      setThreadExists(responseThreadExists);
      setWorkingMemoryData(workingMemory);
      setWorkingMemorySource(source);
      setWorkingMemoryFormat(workingMemoryTemplate?.format || "markdown");
      if (workingMemoryTemplate?.format === "json") {
        let dataToSet = "";
        if (workingMemory) {
          dataToSet = parseJsonString(workingMemory);
        } else if (workingMemoryTemplate?.content) {
          dataToSet = parseJsonString(workingMemoryTemplate.content);
        } else {
          dataToSet = "";
        }
        setWorkingMemoryData(dataToSet);
      } else {
        setWorkingMemoryData(workingMemory || workingMemoryTemplate?.content || "");
      }
    } catch (error) {
      setWorkingMemoryData(null);
      console.error("Error fetching working memory", error);
    } finally {
      setIsLoading(false);
    }
  }, [agentId, client, requestContext, resourceId, threadId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const updateWorkingMemory = async (newMemory: string) => {
    setIsUpdating(true);
    try {
      if (workingMemoryFormat === "json") {
        try {
          JSON.parse(newMemory);
        } catch {
          throw new Error("工作记忆的 JSON 格式无效");
        }
      }
      await client.updateWorkingMemory({
        agentId,
        requestContext,
        resourceId,
        threadId,
        workingMemory: newMemory,
      });
      void refetch();
    } catch (error) {
      console.error("Error updating working memory", error);
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    isLoading,
    isUpdating,
    refetch,
    threadExists,
    updateWorkingMemory,
    workingMemoryData,
    workingMemoryFormat,
    workingMemorySource,
  };
}
