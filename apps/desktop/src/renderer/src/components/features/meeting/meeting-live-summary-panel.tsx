import { hierarchy, tree } from "d3-hierarchy";
import { Background, Controls, MarkerType, ReactFlow } from "@xyflow/react";
import type { Edge, Node, NodeMouseHandler } from "@xyflow/react";
import { useMemo } from "react";
import type { ReactNode } from "react";
import type { MeetingLiveSummarySnapshot } from "@app/shared/meeting-live-summary";
import type { MeetingLiveSummaryControllerSnapshot } from "@/lib/meeting-capture/live-summary-controller";
import { Icon } from "@/components/ui/icon";
import { cn } from "@app/shared/utils";

interface LiveSummaryTreeDatum {
  evidenceTurnId: string | null;
  id: string;
  kind: "point" | "root" | "topic";
  subtitle: string | null;
  title: string;
  children?: LiveSummaryTreeDatum[];
}

export interface LiveSummaryGraphNode extends LiveSummaryTreeDatum {
  x: number;
  y: number;
}

export interface LiveSummaryGraph {
  edges: { id: string; source: string; target: string }[];
  nodes: LiveSummaryGraphNode[];
}

export function buildLiveSummaryGraph(snapshot: MeetingLiveSummarySnapshot): LiveSummaryGraph {
  const root: LiveSummaryTreeDatum = {
    children: snapshot.topics.map((topic) => ({
      children: topic.points.map((point) => ({
        evidenceTurnId: point.evidenceTurnIds[0] ?? null,
        id: point.id,
        kind: "point",
        subtitle: null,
        title: point.text,
      })),
      evidenceTurnId: topic.evidenceTurnIds[0] ?? null,
      id: topic.id,
      kind: "topic",
      subtitle: topic.summary,
      title: topic.title,
    })),
    evidenceTurnId: null,
    id: "meeting-live-summary-root",
    kind: "root",
    subtitle: snapshot.summary,
    title: "实时总结",
  };
  const layout = tree<LiveSummaryTreeDatum>().nodeSize([144, 340])(hierarchy(root));
  return {
    edges: layout.links().map(({ source, target }) => ({
      id: `${source.data.id}:${target.data.id}`,
      source: source.data.id,
      target: target.data.id,
    })),
    nodes: layout.descendants().map((node) => ({
      ...node.data,
      x: node.y,
      y: node.x,
    })),
  };
}

type FlowNodeData = Record<string, ReactNode | string | null> & {
  evidenceTurnId: string | null;
  kind: LiveSummaryTreeDatum["kind"];
  label: ReactNode;
};

function iconForKind(kind: LiveSummaryTreeDatum["kind"]): string {
  if (kind === "root") {
    return "ph:sparkle-fill";
  }
  return kind === "topic" ? "ph:git-branch" : "ph:dot-outline-fill";
}

function nodeBackground(kind: LiveSummaryTreeDatum["kind"]): string {
  if (kind === "root") {
    return "var(--primary)";
  }
  return kind === "topic" ? "var(--background)" : "var(--muted)";
}

function nodeWidth(kind: LiveSummaryTreeDatum["kind"]): number {
  if (kind === "root") {
    return 240;
  }
  return kind === "topic" ? 270 : 250;
}

function nodeLabel(node: LiveSummaryGraphNode) {
  return (
    <div className="grid gap-1 text-left">
      <div className="flex items-center gap-1.5">
        <Icon aria-hidden className="size-3.5 shrink-0" icon={iconForKind(node.kind)} />
        <span className="font-medium text-xs leading-snug">{node.title}</span>
      </div>
      {node.subtitle ? (
        <span
          className={cn(
            "line-clamp-3 text-[11px] leading-relaxed",
            node.kind === "root" ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {node.subtitle}
        </span>
      ) : null}
    </div>
  );
}

function flowNode(node: LiveSummaryGraphNode): Node<FlowNodeData> {
  return {
    ariaLabel: node.evidenceTurnId ? `${node.title}，点击查看字幕证据` : node.title,
    data: {
      evidenceTurnId: node.evidenceTurnId,
      kind: node.kind,
      label: nodeLabel(node),
    },
    id: node.id,
    position: { x: node.x, y: node.y },
    selectable: Boolean(node.evidenceTurnId),
    style: {
      background: nodeBackground(node.kind),
      border: node.kind === "topic" ? "1px solid var(--border)" : "1px solid transparent",
      borderRadius: node.kind === "root" ? 16 : 12,
      boxShadow:
        node.kind === "root"
          ? "0 10px 28px color-mix(in srgb, var(--primary) 20%, transparent)"
          : "none",
      color: node.kind === "root" ? "var(--primary-foreground)" : "var(--foreground)",
      padding: node.kind === "point" ? "9px 12px" : "12px 14px",
      width: nodeWidth(node.kind),
    },
  };
}

export function MeetingLiveSummaryEmpty({
  status,
}: {
  status: MeetingLiveSummaryControllerSnapshot["status"];
}) {
  return (
    <div className="flex h-full min-h-[30rem] flex-col items-center justify-center gap-3 px-8 text-center">
      <Icon
        aria-hidden
        className={cn("size-7 text-muted-foreground", status === "updating" && "animate-pulse")}
        icon="ph:tree-structure"
      />
      <div className="grid gap-1">
        <p className="font-medium text-sm">
          {status === "disabled" ? "当前实时转录源不支持 AI 实时总结" : "正在积累会议内容"}
        </p>
        <p className="text-muted-foreground text-xs">
          形成足够的完整语句后，会自动生成并持续更新主题脉络。
        </p>
      </div>
    </div>
  );
}

export function MeetingLiveSummaryPanel({
  onEvidence,
  snapshot,
}: {
  onEvidence: (turnId: string) => void;
  snapshot: MeetingLiveSummaryControllerSnapshot;
}) {
  const graph = useMemo(
    () => (snapshot.summary ? buildLiveSummaryGraph(snapshot.summary) : null),
    [snapshot.summary],
  );
  const nodes = useMemo(() => graph?.nodes.map(flowNode) ?? [], [graph]);
  const edges = useMemo<Edge[]>(
    () =>
      graph?.edges.map((edge) => ({
        ...edge,
        markerEnd: { color: "var(--border)", type: MarkerType.ArrowClosed },
        style: { stroke: "var(--border)", strokeWidth: 1.5 },
        type: "smoothstep",
      })) ?? [],
    [graph],
  );
  const handleNodeClick: NodeMouseHandler<Node<FlowNodeData>> = (_event, node) => {
    if (node.data.evidenceTurnId) {
      onEvidence(node.data.evidenceTurnId);
    }
  };

  return (
    <div className="h-full min-h-[32rem]">
      {graph ? (
        <div className="h-full overflow-hidden bg-transparent">
          <ReactFlow
            edges={edges}
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.18 }}
            maxZoom={1.5}
            minZoom={0.25}
            nodes={nodes}
            nodesConnectable={false}
            nodesDraggable={false}
            onNodeClick={handleNodeClick}
            panOnScroll
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border)" gap={24} size={1} />
            <Controls position="bottom-right" showInteractive={false} />
          </ReactFlow>
        </div>
      ) : (
        <MeetingLiveSummaryEmpty status={snapshot.status} />
      )}
    </div>
  );
}
