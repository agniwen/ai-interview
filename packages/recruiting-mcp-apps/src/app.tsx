import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import type { App } from "@modelcontextprotocol/ext-apps/react";
import type { McpCandidateDetailCard, RecruitingMcpCard } from "@app/shared/recruiting-mcp-cards";
import { useState } from "react";
import { readRecruitingCard } from "./card-result";
import { RecruitingCardsView } from "./recruiting-cards-view";

const appInfo = { name: "recruiting-cards", version: "1.0.0" };

/** MCP Apps 入口：接收宿主转发的工具结果，并通过宿主调用工具、打开链接。 */
export function RecruitingCardsApp() {
  const [card, setCard] = useState<RecruitingMcpCard | null>(null);
  const [detail, setDetail] = useState<McpCandidateDetailCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingCandidateId, setPendingCandidateId] = useState<string | null>(null);

  const { app, error: connectError } = useApp({
    appInfo,
    capabilities: {},
    onAppCreated: (created: App) => {
      created.ontoolresult = (result) => {
        const read = readRecruitingCard(result);
        setDetail(null);
        if ("card" in read) {
          setCard(read.card);
          setError(null);
        } else {
          setCard(null);
          setError(read.error);
        }
      };
    },
  });
  useHostStyles(app, app?.getHostContext());

  const selectCandidate = async (candidateId: string) => {
    if (!app) {
      return;
    }
    setPendingCandidateId(candidateId);
    setError(null);
    try {
      const read = readRecruitingCard(
        await app.callServerTool({ arguments: { candidateId }, name: "get_candidate" }),
      );
      if ("card" in read && read.card.kind === "candidate_detail") {
        setDetail(read.card);
      } else {
        setError("error" in read ? read.error : "暂时无法打开候选人详情。");
      }
    } catch {
      setError("暂时无法打开候选人详情，请稍后重试。");
    } finally {
      setPendingCandidateId(null);
    }
  };

  const openLink = async (url: string) => {
    try {
      await app?.openLink({ url });
    } catch {
      // 宿主可能按策略拒绝打开外链；保持当前卡片不变即可。
    }
  };

  return (
    <main className="p-0.5">
      <RecruitingCardsView
        card={card}
        detail={detail}
        error={connectError ? "无法连接到当前对话，请刷新后重试。" : error}
        onBack={() => setDetail(null)}
        onOpenLink={app ? openLink : undefined}
        onSelectCandidate={app ? selectCandidate : undefined}
        pendingCandidateId={pendingCandidateId}
      />
    </main>
  );
}
