import {
  getRecruitingBoardGroup,
  recruitingBoardGroups,
  resolveRecruitingBoardView,
} from "@app/shared/recruiting-board";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** 主分组与子流程共同编码进 URL，刷新、分享及列表缓存都使用同一选择。 */
export function RecruitingBoardTabs({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const view = resolveRecruitingBoardView(value);
  const group = getRecruitingBoardGroup(view);
  return (
    <div className="space-y-3">
      <Tabs
        value={group.id}
        onValueChange={(id) => {
          const next = recruitingBoardGroups.find((entry) => entry.id === id);
          if (next) {
            onChange(next.tabs[0].value);
          }
        }}
      >
        <TabsList aria-label="招聘阶段" className="w-full sm:w-fit">
          {recruitingBoardGroups.map((entry) => (
            <TabsTrigger
              key={entry.id}
              value={entry.id}
              className="h-10! flex-1 px-4 text-sm sm:flex-none sm:px-7"
            >
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Tabs value={view} onValueChange={(next) => onChange(String(next))}>
        <TabsList aria-label={`${group.label}子流程`} variant="underline" className="gap-1">
          {group.tabs.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value} className="h-8! px-3 text-xs!">
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
