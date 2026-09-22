import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "next-themes";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Controls,
  Handle,
  Position,
  Panel,
  ReactFlow,
  ViewportPortal,
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react";
import type { Edge, EdgeProps, Node, NodeChange, NodeProps, OnNodeDrag } from "@xyflow/react";
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconGripVertical,
  IconDots,
  IconPlus,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import type { OfferApprovalTemplateNode } from "@app/db-schema/offer-approval";
import { cn } from "@app/shared/utils";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import "@xyflow/react/dist/style.css";
import "./template-flow-editor.css";

export function getApprovalDropIndex(y: number, count: number) {
  return Math.max(0, Math.min(count - 1, Math.round((y - 150) / 190)));
}

const resolverLabels = {
  fixed_member: "固定审批人",
  job_reporting_manager: "岗位汇报上级",
  recruiting_owner: "招聘负责人",
} as const;

const resolverDescriptions = {
  fixed_member: "每次发起审批时，均由指定成员处理。",
  job_reporting_manager: "发起时，自动使用关联岗位设置的汇报上级。",
  recruiting_owner: "发起时，自动使用当前招聘记录的负责人。",
};

type ApprovalFlowNode = Node<
  {
    title: string;
    subtitle: string;
    kind: "start" | "approval" | "end";
    active?: boolean;
    approver?: SearchableSelectOption;
    incomplete?: boolean;
    onSelect?: () => void;
    onMove?: (direction: -1 | 1) => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    disabled?: boolean;
  },
  "approval"
>;

const ApprovalNode = memo(function ApprovalNode({ data }: NodeProps<ApprovalFlowNode>) {
  return (
    <div className="pointer-events-auto relative w-60">
      {data.kind === "start" ? null : (
        <Handle type="target" position={Position.Top} className="opacity-0" />
      )}
      {data.kind === "approval" ? (
        <div
          className={cn(
            "w-full overflow-hidden rounded-xl border bg-card text-left shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            data.active
              ? "border-foreground/60 ring-2 ring-foreground/10 dark:border-neutral-500 dark:ring-1 dark:ring-neutral-500/20"
              : "border-border hover:border-foreground/40",
          )}
        >
          <div className="flex items-center gap-1 border-b bg-muted/50 px-2 py-1.5 text-xs font-medium text-muted-foreground">
            <button
              type="button"
              className="approval-drag-handle nopan flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
              aria-label={`拖动调整${data.title}顺序`}
              title="拖动调整顺序，也可按上下方向键调整"
              disabled={data.disabled || (!data.canMoveUp && !data.canMoveDown)}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  data.onMove?.(event.key === "ArrowUp" ? -1 : 1);
                }
              }}
            >
              <IconGripVertical className="size-4" />
            </button>
            <span className="min-w-0 flex-1 truncate">{data.title}</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="nodrag nopan"
                    aria-label={`${data.title}操作`}
                  />
                }
              >
                <IconDots />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuItem disabled={!data.canMoveUp} onClick={() => data.onMove?.(-1)}>
                    <IconArrowUp />
                    上移
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!data.canMoveDown} onClick={() => data.onMove?.(1)}>
                    <IconArrowDown />
                    下移
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <button
            type="button"
            aria-pressed={data.active}
            onClick={data.onSelect}
            className="nodrag nopan block w-full px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <div className="flex items-center gap-1.5">
              {data.approver ? (
                <Avatar
                  className="data-[size=sm]:size-5"
                  generatedSize={20}
                  label={`${data.approver.label}的头像`}
                  seed={`option:${data.approver.value}`}
                  size="sm"
                >
                  {data.approver.avatarUrl ? (
                    <AvatarImage alt={data.approver.label} src={data.approver.avatarUrl} />
                  ) : null}
                </Avatar>
              ) : null}
              <span
                className={cn(
                  "truncate text-sm font-medium",
                  data.incomplete && "text-destructive",
                )}
              >
                {data.subtitle}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.incomplete ? "请选择审批人" : "点击配置审批节点"}
            </p>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {data.kind === "end" ? (
              <IconCheck className="size-4" />
            ) : (
              <IconUser className="size-4" />
            )}
          </span>
          <div>
            <p className="text-sm font-medium">{data.title}</p>
            <p className="text-xs text-muted-foreground">{data.subtitle}</p>
          </div>
        </div>
      )}
      {data.kind === "end" ? null : (
        <Handle type="source" position={Position.Bottom} className="opacity-0" />
      )}
    </div>
  );
});

type ApprovalFlowEdge = Edge<
  {
    insertionIndex: number;
    sourceTitle: string;
    canInsert: boolean;
    onInsert: (index: number) => void;
  },
  "insert"
>;

export const ApprovalInsertEdge = memo(function ApprovalInsertEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
}: EdgeProps<ApprovalFlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  });
  return (
    <>
      <BaseEdge id={id} path={path} style={style} />
      {data?.canInsert ? (
        <EdgeLabelRenderer>
          <Button
            aria-label={`在${data.sourceTitle}后添加审批节点`}
            className="nodrag nopan absolute rounded-full bg-card shadow-sm hover:bg-muted dark:bg-card dark:hover:bg-muted"
            style={{
              pointerEvents: "all",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            size="icon-sm"
            variant="outline"
            onClick={() => data.onInsert(data.insertionIndex)}
          >
            <IconPlus />
          </Button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});

const edgeTypes = { insert: ApprovalInsertEdge };
const fitViewOptions = { maxZoom: 1, padding: 0.18 };
const ariaLabelConfig = {
  "controls.ariaLabel": "画布视图控制",
  "controls.fitView.ariaLabel": "适应画布",
  "controls.zoomIn.ariaLabel": "放大",
  "controls.zoomOut.ariaLabel": "缩小",
};

const nodeTypes = { approval: ApprovalNode };

function FitApprovalFlow({ nodeCount }: { nodeCount: number }) {
  const initialized = useNodesInitialized();
  const { fitView, viewportInitialized } = useReactFlow();
  useEffect(() => {
    if (!initialized || !viewportInitialized) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      void fitView(fitViewOptions);
    });
    return () => cancelAnimationFrame(frame);
  }, [fitView, initialized, nodeCount, viewportInitialized]);
  return null;
}

interface TemplateFlowEditorProps {
  nodes: OfferApprovalTemplateNode[];
  onChange: (nodes: OfferApprovalTemplateNode[]) => void;
  approvers: SearchableSelectOption[];
  disabled?: boolean;
  toolbar?: ReactNode;
  settings?: ReactNode;
}

export default function TemplateFlowEditor({
  nodes,
  onChange,
  approvers,
  disabled = false,
  toolbar,
  settings,
}: TemplateFlowEditorProps) {
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();
  // Keep React Flow measurements local; the ordered domain nodes remain the saved source of truth.
  const [measurements, setMeasurements] = useState<Map<string, { width: number; height: number }>>(
    () => new Map(),
  );
  const onNodesChange = useCallback((changes: NodeChange<ApprovalFlowNode>[]) => {
    const dimensions = changes.filter(
      (change) => change.type === "dimensions" && change.dimensions,
    );
    if (dimensions.length === 0) {
      return;
    }
    setMeasurements((current) => {
      const next = new Map(current);
      for (const change of dimensions) {
        if (change.type === "dimensions" && change.dimensions) {
          next.set(change.id, change.dimensions);
        }
      }
      return next;
    });
  }, []);
  const [selectedId, setSelectedId] = useState(nodes[0]?.id);
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];
  const selectedIndex = nodes.findIndex((node) => node.id === selected?.id);

  const insertNode = useCallback(
    (index: number) => {
      if (disabled || nodes.length >= 5) {
        return;
      }
      const node: OfferApprovalTemplateNode = {
        fixedUserId: null,
        id: crypto.randomUUID(),
        resolverType: "fixed_member",
      };
      onChange([...nodes.slice(0, index), node, ...nodes.slice(index)]);
      setSelectedId(node.id);
    },
    [disabled, nodes, onChange],
  );

  function updateNode(next: OfferApprovalTemplateNode) {
    onChange(nodes.map((node) => (node.id === next.id ? next : node)));
  }

  const moveNode = useCallback(
    (id: string, destination: number) => {
      if (disabled) {
        return;
      }
      const source = nodes.findIndex((node) => node.id === id);
      if (
        source === -1 ||
        destination < 0 ||
        destination >= nodes.length ||
        source === destination
      ) {
        return;
      }
      const next = [...nodes];
      const [node] = next.splice(source, 1);
      next.splice(destination, 0, node);
      onChange(next);
      setSelectedId(id);
    },
    [disabled, nodes, onChange],
  );

  const [drag, setDrag] = useState<{ id: string; y: number; destination: number } | null>(null);
  const draggingId = useRef<string | null>(null);
  const trackDrag = useCallback<OnNodeDrag<ApprovalFlowNode>>(
    (_event, node) => {
      if (disabled || !draggingId.current) {
        return;
      }
      const y = Math.max(150, Math.min(150 + (nodes.length - 1) * 190, node.position.y));
      setDrag({ destination: getApprovalDropIndex(y, nodes.length), id: draggingId.current, y });
    },
    [disabled, nodes.length],
  );
  useEffect(() => {
    if (!drag) {
      return;
    }
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        draggingId.current = null;
        setDrag(null);
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [drag]);

  const canInsert = !disabled && nodes.length < 5;
  const flowNodes = useMemo<ApprovalFlowNode[]>(
    () => [
      {
        data: {
          kind: "start",
          subtitle: "提交 Offer 与申请理由",
          title: "发起审批",
        },
        id: "flow-start",
        position: { x: 0, y: 0 },
        type: "approval",
      },
      ...nodes.map(
        (node, index): ApprovalFlowNode => ({
          data: {
            active: selected?.id === node.id,
            approver:
              node.resolverType === "fixed_member" && node.fixedUserId
                ? (approvers.find((person) => person.value === node.fixedUserId) ?? {
                    label: "成员不可用",
                    value: node.fixedUserId,
                  })
                : undefined,
            canMoveDown: !disabled && index < nodes.length - 1,
            canMoveUp: !disabled && index > 0,
            disabled,
            incomplete: node.resolverType === "fixed_member" && !node.fixedUserId,
            kind: "approval",
            onMove: (direction) => moveNode(node.id, index + direction),
            onSelect: () => setSelectedId(node.id),
            subtitle:
              node.resolverType === "fixed_member"
                ? (approvers.find((person) => person.value === node.fixedUserId)?.label ??
                  (node.fixedUserId ? "成员不可用" : "待设置审批人"))
                : resolverLabels[node.resolverType],
            title: `审批 ${index + 1} · ${resolverLabels[node.resolverType]}`,
          },
          dragHandle: ".approval-drag-handle",
          draggable: !disabled && nodes.length > 1,
          id: `approval-${node.id}`,
          position: { x: 0, y: 150 + index * 190 },
          type: "approval",
        }),
      ),
      {
        data: { kind: "end", subtitle: "全部通过后，可发布 Offer", title: "审批完成" },
        id: "flow-end",
        position: { x: 0, y: 150 + nodes.length * 190 },
        type: "approval",
      },
    ],
    [nodes, approvers, selected?.id, disabled, moveNode],
  );
  const measuredFlowNodes = useMemo(
    () =>
      flowNodes.map((node) => {
        const measured: ApprovalFlowNode = { ...node, measured: measurements.get(node.id) };
        if (node.data.kind === "approval") {
          measured.extent = [
            [0, 150],
            [240, 150 + (nodes.length - 1) * 190 + (measurements.get(node.id)?.height ?? 120)],
          ];
        }
        if (drag && node.id === `approval-${drag.id}`) {
          measured.position = { x: 0, y: drag.y };
          measured.style = { opacity: 0.85 };
          measured.zIndex = 10;
        }
        return measured;
      }),
    [flowNodes, measurements, drag, nodes.length],
  );
  const edges = useMemo<ApprovalFlowEdge[]>(() => {
    const ids = ["flow-start", ...nodes.map((node) => `approval-${node.id}`), "flow-end"];
    return ids.slice(1).map((id, index) => ({
      data: {
        canInsert: canInsert && !drag,
        insertionIndex: index,
        onInsert: insertNode,
        sourceTitle:
          index === 0
            ? "发起审批"
            : `审批 ${index} · ${resolverLabels[nodes[index - 1].resolverType]}`,
      },
      id: `${ids[index]}-${id}`,
      selectable: false,
      source: ids[index],
      style: { opacity: drag ? 0.2 : 1, stroke: "var(--muted-foreground)", strokeWidth: 1.5 },
      target: id,
      type: "insert",
    }));
  }, [nodes, canInsert, insertNode, drag]);

  return (
    <div className="approval-template-editor relative h-full min-h-0 w-full flex-1 bg-muted/20">
      <div className="absolute inset-0">
        <ReactFlow
          className="approval-template-flow"
          aria-label="Offer 审批流程画布"
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          ariaLabelConfig={ariaLabelConfig}
          nodes={measuredFlowNodes}
          onNodesChange={onNodesChange}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          onNodeDragStart={(event, node) => {
            const domainNode = nodes.find((item) => `approval-${item.id}` === node.id);
            if (!domainNode || disabled) {
              return;
            }
            draggingId.current = domainNode.id;
            setSelectedId(domainNode.id);
            trackDrag(event, node, [node]);
          }}
          onNodeDrag={trackDrag}
          onNodeDragStop={(_event, node) => {
            if (draggingId.current) {
              moveNode(draggingId.current, getApprovalDropIndex(node.position.y, nodes.length));
            }
            draggingId.current = null;
            setDrag(null);
          }}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          fitViewOptions={fitViewOptions}
          minZoom={0.2}
          maxZoom={1.5}
        >
          <Background
            variant={BackgroundVariant.Dots}
            color={resolvedTheme === "dark" ? "#525252" : "#bdbdbd"}
            gap={20}
            size={1.25}
          />
          <Controls showInteractive={false} position="bottom-left" />
          <FitApprovalFlow nodeCount={nodes.length} />
          {drag ? (
            <ViewportPortal>
              <div
                className="pointer-events-none absolute w-60 rounded-xl border border-dashed border-muted-foreground/50 bg-muted/20"
                style={{
                  height: measurements.get(`approval-${drag.id}`)?.height ?? 120,
                  left: 0,
                  top: 150 + nodes.findIndex((node) => node.id === drag.id) * 190,
                }}
              />
              <div
                className="pointer-events-none absolute flex w-60 items-center gap-2 text-xs text-foreground"
                style={{
                  left: 0,
                  top:
                    150 +
                    drag.destination * 190 +
                    (drag.destination > nodes.findIndex((node) => node.id === drag.id) ? 135 : -30),
                }}
              >
                <span className="h-0.5 flex-1 bg-foreground" />
                <span className="rounded bg-card px-2 py-1">放到第 {drag.destination + 1} 步</span>
                <span className="h-0.5 flex-1 bg-foreground" />
              </div>
            </ViewportPortal>
          ) : null}
          <Panel
            position="top-right"
            style={{ top: "var(--header-height, 0px)" }}
            className="approval-template-settings nowheel flex max-h-[calc(100%-var(--header-height,0px)-2rem)] w-80 max-w-[calc(100%-5rem)] flex-col gap-3 overflow-y-auto overscroll-contain"
          >
            <section aria-label="全局设置" className="shrink-0 rounded-xl border bg-card p-4">
              {toolbar}
              {settings ? (
                <div className={cn(toolbar && "mt-4 border-t pt-4")}>{settings}</div>
              ) : null}
              <div
                className={cn("flex flex-col gap-3", (toolbar || settings) && "mt-4 border-t pt-4")}
              >
                <span className="text-xs text-muted-foreground">
                  {nodes.length} / 5 个节点 · 按顺序依次审批
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={!canInsert}
                  onClick={() => insertNode(nodes.length)}
                >
                  <IconPlus />
                  添加审批节点
                </Button>
              </div>
            </section>
            <details open={!isMobile} className="shrink-0 rounded-xl border bg-card">
              <summary className="cursor-pointer px-4 py-4 text-sm font-medium">节点设置</summary>
              <div className="space-y-4 px-4 pb-4">
                {selected ? (
                  <aside className="space-y-4" aria-label="审批节点配置">
                    <h3 className="font-medium">审批 {selectedIndex + 1}</h3>
                    <div className="space-y-2">
                      <Label htmlFor="approval-resolver">审批人来源</Label>
                      <Select
                        value={selected.resolverType}
                        disabled={disabled}
                        onValueChange={(value) => {
                          if (
                            value === "fixed_member" ||
                            value === "job_reporting_manager" ||
                            value === "recruiting_owner"
                          ) {
                            updateNode({
                              ...selected,
                              fixedUserId: value === "fixed_member" ? selected.fixedUserId : null,
                              resolverType: value,
                            });
                          }
                        }}
                      >
                        <SelectTrigger id="approval-resolver" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {Object.entries(resolverLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {resolverDescriptions[selected.resolverType]}
                      </p>
                    </div>
                    {selected.resolverType === "fixed_member" ? (
                      <div className="space-y-2">
                        <Label htmlFor="approval-fixed-member">审批人</Label>
                        <SearchableSelect
                          id="approval-fixed-member"
                          options={approvers}
                          value={selected.fixedUserId}
                          disabled={disabled}
                          clearable
                          placeholder="请选择审批人"
                          searchPlaceholder="搜索审批人…"
                          emptyMessage="没有匹配的审批人"
                          onChange={(fixedUserId) => updateNode({ ...selected, fixedUserId })}
                        />
                      </div>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={disabled || nodes.length === 1}
                      onClick={() => {
                        const remaining = nodes.filter((node) => node.id !== selected.id);
                        onChange(remaining);
                        setSelectedId(remaining[Math.min(selectedIndex, remaining.length - 1)]?.id);
                      }}
                    >
                      <IconTrash />
                      删除此节点
                    </Button>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      提交审批时会固定实际审批人。重复人员保留为独立节点，提交人也可作为模板审批人。
                    </p>
                  </aside>
                ) : null}
              </div>
            </details>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}
