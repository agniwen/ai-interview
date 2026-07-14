import { useParams } from "@/components/features/mastra-studio/router/compat";
import { DatasetCombobox } from "./components/dataset-combobox";

export function DatasetCrumb() {
  const { datasetId } = useParams<{ datasetId: string }>();
  if (!datasetId) {
    return null;
  }
  return <DatasetCombobox value={datasetId} variant="ghost" />;
}
