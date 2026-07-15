import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { SelectFieldBlock } from "@mastra/playground-ui/components/FormFieldBlocks";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { XIcon } from "lucide-react";

export interface ScoreEntityOption {
  value: string;
  label: string;
  type: "AGENT" | "WORKFLOW" | "ALL";
}

interface ScoresToolsProps {
  selectedEntity?: ScoreEntityOption;
  entityOptions?: ScoreEntityOption[];
  onEntityChange: (val: ScoreEntityOption) => void;
  onReset?: () => void;
  isLoading?: boolean;
}

export function ScoresTools({
  onEntityChange,
  onReset,
  selectedEntity,
  entityOptions,
  isLoading,
}: ScoresToolsProps) {
  return (
    <ButtonsGroup>
      <SelectFieldBlock
        label="按实体筛选"
        labelIsHidden={true}
        name="select-entity"
        placeholder="请选择..."
        size="md"
        options={entityOptions || []}
        onValueChange={(val: string) => {
          const entity = entityOptions?.find((option) => option.value === val);
          if (entity) {
            onEntityChange(entity);
          }
        }}
        value={selectedEntity?.value || ""}
        className="min-w-56"
        disabled={isLoading}
      />

      {selectedEntity && selectedEntity.value !== "all" && (
        <Button onClick={onReset} disabled={isLoading} size="md">
          重置
          <Icon>
            <XIcon />
          </Icon>
        </Button>
      )}
    </ButtonsGroup>
  );
}
