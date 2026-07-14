import { useParams } from "@/components/features/mastra-studio/router/compat";
import { ToolPanel } from "@/components/features/mastra-studio/upstream/domains/tools/components/ToolPanel";

const Tool = () => {
  const { toolId } = useParams();

  return (
    <div className="h-full w-full overflow-y-hidden">
      <ToolPanel toolId={toolId!} />
    </div>
  );
};

export default Tool;
