import { Button } from "@mastra/playground-ui/components/Button";
import { TextFieldBlock } from "@mastra/playground-ui/components/FormFieldBlocks";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Plus, Trash } from "lucide-react";
import { useId } from "react";

export interface HeaderListFormItem {
  name: string;
  value: string;
}

export interface HeaderListFormProps {
  headers: HeaderListFormItem[];
  onAddHeader: (header: HeaderListFormItem) => void;
  onRemoveHeader: (index: number) => void;
}

export const HeaderListForm = ({ headers, onAddHeader, onRemoveHeader }: HeaderListFormProps) => (
  <div className="space-y-4">
    <Txt as="h2" variant="header-xs" className="text-neutral6">
      请求头
    </Txt>

    <div className=" space-y-6">
      {headers.length > 0 && (
        <ul className="space-y-4">
          {headers.map((header, index) => (
            <li key={index}>
              <HeaderListFormItem
                index={index}
                header={header}
                onRemove={() => onRemoveHeader(index)}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 justify-between">
        {headers.length === 0 && <Txt className="text-neutral3">尚未添加请求头</Txt>}
        <Button
          type="button"
          onClick={() => onAddHeader({ name: "", value: "" })}
          size={headers.length === 0 ? "md" : "sm"}
          className=""
        >
          <Plus />
          {headers.length === 0 ? "添加请求头" : "继续添加请求头"}
        </Button>
      </div>
    </div>
  </div>
);

interface HeaderListFormItemProps {
  header: HeaderListFormItem;
  index: number;
  onRemove: () => void;
}

const HeaderListFormItem = ({ index, header, onRemove }: HeaderListFormItemProps) => {
  const nameId = useId();
  const valueId = useId();

  return (
    <div className="grid grid-cols-[1fr_1fr_auto] gap-4 items-end">
      <TextFieldBlock
        id={nameId}
        name={`headers.${index}.name`}
        label="名称"
        placeholder="例如 Authorization"
        required
        defaultValue={header.name}
      />

      <TextFieldBlock
        id={valueId}
        name={`headers.${index}.value`}
        label="值"
        placeholder="例如 Bearer <token>"
        required
        defaultValue={header.value}
      />

      <Button type="button" onClick={onRemove} aria-label="移除请求头" tooltip="移除请求头">
        <Trash />
      </Button>
    </div>
  );
};
