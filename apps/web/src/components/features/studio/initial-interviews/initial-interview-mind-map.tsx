import { hierarchy, tree } from "d3-hierarchy";
import {
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  useStore,
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react";
import type { Edge, Node, NodeMouseHandler, NodeProps } from "@xyflow/react";
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import type { MeetingLiveSummarySnapshot } from "@app/shared/meeting-live-summary";

import { IconGitBranch, IconSparkles } from "@tabler/icons-react";
import "@xyflow/react/dist/style.css";
import { cn } from "@app/shared/utils";

interface MeetingLiveSummaryControllerSnapshot {
  summary: MeetingLiveSummarySnapshot | null;
  status: "ready" | "idle" | "disabled" | "updating";
}

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

function StandaloneSummaryNode({ data }: NodeProps<Node<FlowNodeData>>) {
  return <>{data.label}</>;
}

const summaryNodeTypes = { standalone: StandaloneSummaryNode };

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
        {node.kind === "root" ? <IconSparkles aria-hidden className="size-3.5 shrink-0" /> : null}
        {node.kind === "topic" ? <IconGitBranch aria-hidden className="size-3.5 shrink-0" /> : null}
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

export function buildLiveSummaryFlowNode(node: LiveSummaryGraphNode): Node<FlowNodeData> {
  const hasChildren = Boolean(node.children?.length);
  let type = hasChildren ? "default" : "output";
  if (node.kind === "root") {
    type = hasChildren ? "input" : "standalone";
  }
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
    sourcePosition: Position.Right,
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
    targetPosition: Position.Left,
    type,
  };
}

// React Flow already observes its container, including sidebar and split-pane resizing.
function SummaryViewport({ graphKey }: { graphKey: string }) {
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const initialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!initialized || width <= 0 || height <= 0) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      void fitView({ maxZoom: 1, minZoom: 0.05, padding: 0.18 });
    });
    return () => cancelAnimationFrame(frame);
  }, [fitView, graphKey, height, initialized, width]);
  return null;
}

export function MeetingLiveSummaryPanel({
  onEvidence,
  onNodeSelect,
  snapshot,
}: {
  onEvidence: (turnId: string) => void;
  onNodeSelect?: (nodeId: string) => void;
  snapshot: MeetingLiveSummaryControllerSnapshot;
}) {
  const graph = useMemo(
    () => (snapshot.summary ? buildLiveSummaryGraph(snapshot.summary) : null),
    [snapshot.summary],
  );
  const nodes = useMemo(
    () =>
      graph?.nodes.map((node) => {
        const flowNode = buildLiveSummaryFlowNode(node);
        if (onNodeSelect) {
          flowNode.ariaLabel = `${node.title}，点击查看对应总结`;
          flowNode.selectable = true;
        }
        return flowNode;
      }) ?? [],
    [graph, onNodeSelect],
  );
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
    if (onNodeSelect) {
      onNodeSelect(node.id);
    } else if (node.data.evidenceTurnId) {
      onEvidence(node.data.evidenceTurnId);
    }
  };

  return (
    <div className="h-full min-h-0 min-w-0">
      {graph ? (
        <div className="h-full overflow-hidden bg-transparent">
          <ReactFlow
            data-slot="meeting-summary-flow"
            edges={edges}
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.18 }}
            maxZoom={1.5}
            minZoom={0.05}
            nodes={nodes}
            nodeTypes={summaryNodeTypes}
            nodesConnectable={false}
            nodesDraggable={false}
            onNodeClick={handleNodeClick}
            panOnScroll
            proOptions={{ hideAttribution: true }}
          >
            <SummaryViewport graphKey={nodes.map((node) => node.id).join("|")} />
            <Background color="var(--border)" gap={24} size={1} />
            <Controls position="bottom-right" showInteractive={false} />
          </ReactFlow>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">暂无总结</p>
      )}
    </div>
  );
}
