import { IconAdjustmentsHorizontal, IconSettings2 } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SETTINGS_BODY_CLASS, SETTINGS_HEADER_CLASS } from "./form-template-editor-layout";

export type FormEditorSideTab = "question" | "settings";

/**
 * 紧凑布局的左栏：基础设置与题目配置共用一栏，用页签切换，画布在右侧。
 * Compact layout's left column: basic settings and question config share it behind tabs.
 */
export function FormEditorSideTabs({
  onValueChange,
  question,
  settings,
  value,
}: {
  onValueChange: (value: FormEditorSideTab) => void;
  question: ReactNode;
  settings: ReactNode;
  value: FormEditorSideTab;
}) {
  return (
    <Tabs
      className="min-h-0 flex-1 gap-0"
      onValueChange={(next) => onValueChange(next === "question" ? "question" : "settings")}
      value={value}
    >
      <div className={SETTINGS_HEADER_CLASS}>
        <TabsList aria-label="编辑面板" variant="underline">
          <TabsTrigger value="settings">
            <IconAdjustmentsHorizontal />
            基础设置
          </TabsTrigger>
          <TabsTrigger value="question">
            <IconSettings2 />
            题目配置
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent className={SETTINGS_BODY_CLASS} value="settings">
        {settings}
      </TabsContent>
      <TabsContent className={SETTINGS_BODY_CLASS} value="question">
        {question}
      </TabsContent>
    </Tabs>
  );
}
