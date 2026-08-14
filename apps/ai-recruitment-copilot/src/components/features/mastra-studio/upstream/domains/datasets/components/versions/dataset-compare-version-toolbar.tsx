import { Column } from "@mastra/playground-ui/components/Columns";
import { SelectFieldBlock } from "@mastra/playground-ui/components/FormFieldBlocks";
import { format } from "date-fns";
import { useDatasetVersions } from "../../hooks/use-dataset-versions";

export interface DatasetCompareVersionToolbarProps {
  datasetId: string;
  versionA?: string;
  versionB?: string;
  onVersionChange?: (versionA: string, versionB: string) => void;
}

function formatVersionLabel(version: number, createdAt?: Date | string): string {
  if (createdAt) {
    const d = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
    return `v${version}  ${format(d, "MM/dd HH:mm:ss")}`;
  }
  return `v${version}`;
}

export function DatasetCompareVersionToolbar({
  datasetId,
  versionA,
  versionB,
  onVersionChange,
}: DatasetCompareVersionToolbarProps) {
  const { data: versions } = useDatasetVersions(datasetId);

  const options = (versions ?? []).map((v) => ({
    label: `${formatVersionLabel(v.version, v.createdAt)}${v.isCurrent ? "（当前）" : ""}`,
    value: String(v.version),
  }));

  return (
    <Column.Toolbar className="grid grid-cols-[1fr_1fr_1fr_10rem] gap-4 w-full">
      <div />
      <SelectFieldBlock
        label="版本 A"
        labelIsHidden={true}
        name="version-a"
        placeholder="选择版本"
        options={options}
        value={versionA ?? ""}
        onValueChange={(val: string) => onVersionChange?.(val, versionB ?? "")}
      />
      <SelectFieldBlock
        label="版本 B"
        labelIsHidden={true}
        name="version-b"
        options={options}
        value={versionB ?? ""}
        onValueChange={(val: string) => onVersionChange?.(versionA ?? "", val)}
      />
      <div />
    </Column.Toolbar>
  );
}
