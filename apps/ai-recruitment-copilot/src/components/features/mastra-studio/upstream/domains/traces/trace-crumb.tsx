import { Truncate } from "@mastra/playground-ui/components/Truncate";
import { useParams } from "@/components/features/mastra-studio/router/compat";

export function TraceCrumb() {
  const { traceId } = useParams<{ traceId: string }>();
  if (!traceId) {
    return null;
  }

  return (
    <Truncate untilChar="-" copy>
      {traceId}
    </Truncate>
  );
}
