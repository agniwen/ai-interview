import type { GetScorerResponse } from "@mastra/client-js";
import { Badge } from "@mastra/playground-ui/components/Badge";
import { Button } from "@mastra/playground-ui/components/Button";
import { Chip } from "@mastra/playground-ui/components/Chip";
import { Switch } from "@mastra/playground-ui/components/Switch";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { Pencil } from "lucide-react";

interface LinkedDataset {
  id: string;
  name: string;
}

interface ScorerDetailViewProps {
  scorerId: string;
  scorerData?: GetScorerResponse;
  isAttached: boolean;
  onToggleAttach: () => void;
  onEdit: () => void;
  linkedDatasets?: LinkedDataset[];
  onViewDataset?: (datasetId: string) => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Txt variant="ui-xs" className="text-neutral3 w-24 shrink-0">
        {label}
      </Txt>
      <Txt variant="ui-xs" className="text-neutral5 break-all">
        {value}
      </Txt>
    </div>
  );
}

export function ScorerDetailView({
  scorerId,
  scorerData,
  isAttached,
  onToggleAttach,
  onEdit,
  linkedDatasets,
  onViewDataset,
}: ScorerDetailViewProps) {
  if (!scorerData) {
    return (
      <div className="flex items-center justify-center h-full">
        <Txt variant="ui-sm" className="text-neutral3">
          未找到评分器
        </Txt>
      </div>
    );
  }

  const name = scorerData.scorer?.name || scorerId;
  const description = scorerData.scorer?.description;
  const isCode = scorerData.source === "code";
  const isTrajectory = scorerData.scorer?.config?.type === "trajectory";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border1 space-y-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Txt variant="ui-sm" className="text-neutral5 font-medium truncate">
                {name}
              </Txt>
              {isTrajectory && (
                <Chip size="small" color="purple">
                  轨迹
                </Chip>
              )}
              {isCode && (
                <span title="在代码中定义——无法在界面中编辑">
                  <Badge variant="default">代码</Badge>
                </span>
              )}
            </div>
            {description && (
              <Txt variant="ui-xs" className="text-neutral3 block mt-1">
                {description}
              </Txt>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {!isCode && (
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Icon size="sm">
                  <Pencil />
                </Icon>
                编辑
              </Button>
            )}
          </div>
        </div>

        {/* Attach toggle */}
        <div className="flex items-center justify-between py-2 px-3 bg-surface3 rounded-md">
          <div>
            <Txt variant="ui-xs" className="text-neutral5 block">
              在实验中运行
            </Txt>
            <Txt variant="ui-xs" className="text-neutral3 block mt-0.5">
              启用后，此评分器会为该智能体的实验结果评分
            </Txt>
          </div>
          <Switch checked={isAttached} onCheckedChange={onToggleAttach} />
        </div>
      </div>

      {/* Details */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <Txt
            variant="ui-xs"
            className="text-neutral3 font-medium uppercase tracking-wider block mb-2"
          >
            详情
          </Txt>
          <div className="space-y-2">
            <DetailRow label="ID" value={scorerId} />
            <DetailRow label="类型" value={isTrajectory ? "轨迹" : "智能体"} />
            <DetailRow label="来源" value={isCode ? "代码" : "已存储"} />
            {scorerData.agentIds && scorerData.agentIds.length > 0 && (
              <DetailRow
                label="被智能体使用"
                value={scorerData.agentNames?.join(", ") || scorerData.agentIds.join(", ")}
              />
            )}
          </div>
        </div>

        {linkedDatasets && linkedDatasets.length > 0 && (
          <div>
            <Txt
              variant="ui-xs"
              className="text-neutral3 font-medium uppercase tracking-wider block mb-2"
            >
              数据集
            </Txt>
            <div className="space-y-1">
              {linkedDatasets.map((ds) =>
                onViewDataset ? (
                  <button
                    key={ds.id}
                    onClick={() => onViewDataset(ds.id)}
                    className="w-full text-left px-3 py-2 rounded-md bg-surface3 hover:bg-surface4 transition-colors cursor-pointer"
                  >
                    <Txt variant="ui-xs" className="text-neutral5">
                      {ds.name}
                    </Txt>
                  </button>
                ) : (
                  <div key={ds.id} className="px-3 py-2 rounded-md bg-surface3">
                    <Txt variant="ui-xs" className="text-neutral5">
                      {ds.name}
                    </Txt>
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        {isCode && (
          <div className="p-3 bg-surface3 rounded-md">
            <Txt variant="ui-xs" className="text-neutral3">
              此评分器在代码中定义，无法在界面中编辑。你可以切换它是否参与该智能体的实验。
            </Txt>
          </div>
        )}
      </div>
    </div>
  );
}
