import { KeyValueList } from "@mastra/playground-ui/components/KeyValueList";
import type { KeyValueListItemData } from "@mastra/playground-ui/components/KeyValueList";
import { cn } from "@mastra/playground-ui/utils/cn";
import { PackageOpenIcon } from "lucide-react";
import type { ElementType } from "react";
import { Container } from "./shared";

interface TemplateSuccessProps {
  name: string;
  entities?: string[];
  installedEntities?: KeyValueListItemData[];
  linkComponent?: ElementType;
}

export function TemplateSuccess({ name, installedEntities }: TemplateSuccessProps) {
  return (
    <Container
      className={cn(
        "grid items-center justify-items-center gap-4 content-center",
        "[&>svg]:w-8 [&>svg]:h-8",
      )}
    >
      <PackageOpenIcon />
      <h2 className="text-header-md">完成！</h2>
      <p className="text-ui-md text-center text-neutral3 ">
        模板 <b className="text-neutral4">{name}</b> 已成功安装。
        {installedEntities && installedEntities.length > 0 && (
          <>
            <br /> 已安装的实体如下。
          </>
        )}
      </p>
      {installedEntities && installedEntities.length > 0 && (
        <KeyValueList data={installedEntities} />
      )}
    </Container>
  );
}
