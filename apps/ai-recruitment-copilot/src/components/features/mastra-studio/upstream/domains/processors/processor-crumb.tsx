import { useParams } from "@/components/features/mastra-studio/router/compat";
import { ProcessorCombobox } from "./components/processor-combobox";

export function ProcessorCrumb() {
  const { processorId } = useParams<{ processorId: string }>();
  if (!processorId) {
    return null;
  }

  return <ProcessorCombobox value={processorId} variant="ghost" />;
}
