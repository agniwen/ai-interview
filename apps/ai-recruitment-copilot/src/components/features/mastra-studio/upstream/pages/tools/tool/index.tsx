import { useParams } from "@/components/features/mastra-studio/router/compat";
import { ToolPanel } from "@/components/features/mastra-studio/upstream/domains/tools/components/tool-panel";

const Tool = () => {
  const { toolId } = useParams();
  const resolvedToolId = toolId ?? "";

  return (
    <div className="h-full w-full overflow-y-hidden">
      <ToolPanel toolId={resolvedToolId} />
    </div>
  );
};

export default Tool;
