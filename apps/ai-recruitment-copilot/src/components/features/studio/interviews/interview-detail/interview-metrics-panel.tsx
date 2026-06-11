import { DetailRow } from "./detail-row";
import { SoftPanel } from "@/components/features/display/soft-panel";
import { cn } from "@arc/shared/utils";

/**
 * Agent 端 metrics_collected 聚合后落库的形状。与 agent.py 中的 metrics_state 对齐:
 *   metrics.session.{llm,stt,tts,eou,interruption,vad}
 *   metrics.turns[speech_id] -> {llm_ttft, llm_duration, tts_ttfb, tts_duration, eou_delay, transcription_delay, ...}
 *
 * Shape mirrors the metrics_state container persisted by the Python agent.
 * Everything is optional because old conversations predating the metrics column
 * have an empty {} stored, and partial metrics are possible if a session crashes
 * mid-pipeline.
 */
interface MetricsShape {
  session?: {
    llm?: {
      request_count?: number;
      total_completion_tokens?: number;
      total_prompt_tokens?: number;
      total_tokens?: number;
      total_duration?: number;
      ttft_sum?: number;
      ttft_count?: number;
    };
    stt?: {
      request_count?: number;
      total_audio_duration?: number;
      total_duration?: number;
    };
    tts?: {
      request_count?: number;
      total_audio_duration?: number;
      total_characters?: number;
      total_duration?: number;
      ttfb_sum?: number;
      ttfb_count?: number;
    };
    eou?: {
      count?: number;
      end_of_utterance_delay_sum?: number;
      transcription_delay_sum?: number;
      on_user_turn_completed_delay_sum?: number;
    };
    interruption?: {
      num_interruptions?: number;
      num_backchannels?: number;
      num_requests?: number;
      latest_detection_delay?: number;
    };
    vad?: {
      total_inference_duration?: number;
      total_inference_count?: number;
    };
  };
  turns?: Record<
    string,
    {
      llm_ttft?: number;
      llm_duration?: number;
      llm_total_tokens?: number;
      tts_ttfb?: number;
      tts_duration?: number;
      tts_characters?: number;
      eou_delay?: number;
      transcription_delay?: number;
    }
  >;
}

function isEmptyMetrics(m: MetricsShape): boolean {
  const { session } = m;
  if (!session) {
    return Object.keys(m.turns ?? {}).length === 0;
  }
  const llmCount = session.llm?.request_count ?? 0;
  const sttCount = session.stt?.request_count ?? 0;
  const ttsCount = session.tts?.request_count ?? 0;
  return llmCount + sttCount + ttsCount === 0;
}

function formatSeconds(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "—";
  }
  if (value < 1) {
    return `${Math.round(value * 1000)} ms`;
  }
  return `${value.toFixed(2)} s`;
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return Math.round(value).toLocaleString();
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) {
    return null;
  }
  if (sorted.length === 1) {
    return sorted[0] ?? null;
  }
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) {
    return sorted[lower] ?? null;
  }
  const a = sorted[lower];
  const b = sorted[upper];
  if (a === undefined || b === undefined) {
    return null;
  }
  return a + (b - a) * (pos - lower);
}

/**
 * 单轮端到端响应延迟的近似：用户说完(end_of_utterance_delay) → STT 完结(transcription_delay)
 *   → LLM 首 token(llm_ttft) → TTS 首音(tts_ttfb)。
 *
 * Approximates the per-turn time from "user finished speaking" to "agent
 * speaks first audio byte" by summing the four pipeline-stage delays we
 * record per speech_id.
 */
function computeTurnE2eLatencies(turns: NonNullable<MetricsShape["turns"]>): number[] {
  const latencies: number[] = [];
  for (const turn of Object.values(turns)) {
    const eou = turn.eou_delay ?? 0;
    const transcription = turn.transcription_delay ?? 0;
    const llm = turn.llm_ttft && turn.llm_ttft > 0 ? turn.llm_ttft : 0;
    const tts = turn.tts_ttfb && turn.tts_ttfb > 0 ? turn.tts_ttfb : 0;
    const total = eou + transcription + llm + tts;
    if (total > 0) {
      latencies.push(total);
    }
  }
  return latencies.toSorted((a, b) => a - b);
}

/**
 * 累加和 / 次数 的安全平均：缺失或除零返回 null，避免分母为 0 的 NaN 渲染。
 *
 * Safe sum-over-count average; returns null when either side is missing or
 * the count is zero so the UI can show "—" instead of NaN.
 */
function safeAvg(sum: number | undefined, count: number | undefined): number | null {
  if (typeof sum !== "number" || typeof count !== "number" || count <= 0) {
    return null;
  }
  return sum / count;
}

/**
 * 渲染 Agent 端 metrics_collected 聚合出的会话级延迟与用量统计。空指标(老数据)显示占位文案。
 *
 * Renders the per-conversation metrics aggregated by the agent's
 * metrics_collected listener. Falls back to a friendly empty state for
 * conversations that predate the metrics column.
 */
export function InterviewMetricsPanel({
  metrics,
  surface = "card",
}: {
  metrics: Record<string, unknown>;
  surface?: "card" | "section";
}) {
  const m = metrics as MetricsShape;

  if (isEmptyMetrics(m)) {
    const Component = surface === "card" ? "div" : SoftPanel;
    return (
      <Component
        className={cn(
          surface === "card" ? "rounded-2xl border border-border bg-background p-4" : "p-4",
        )}
      >
        <h4 className="font-medium text-sm">通话指标</h4>
        <p className="mt-3 text-muted-foreground text-sm leading-normal">
          本场面试未上报性能指标（可能是 agent 升级前的历史会话）。
        </p>
      </Component>
    );
  }

  const llm = m.session?.llm ?? {};
  const stt = m.session?.stt ?? {};
  const tts = m.session?.tts ?? {};
  const eou = m.session?.eou ?? {};
  const interruption = m.session?.interruption ?? {};

  const llmAvgTtft = safeAvg(llm.ttft_sum, llm.ttft_count);
  const ttsAvgTtfb = safeAvg(tts.ttfb_sum, tts.ttfb_count);
  const eouAvg = safeAvg(eou.end_of_utterance_delay_sum, eou.count);
  const transcriptionAvg = safeAvg(eou.transcription_delay_sum, eou.count);

  const e2eLatencies = computeTurnE2eLatencies(m.turns ?? {});
  const e2eP50 = quantile(e2eLatencies, 0.5);
  const e2eP95 = quantile(e2eLatencies, 0.95);
  const Component = surface === "card" ? "div" : SoftPanel;

  return (
    <Component
      className={cn(
        surface === "card" ? "rounded-2xl border border-border bg-background p-4" : "p-4",
      )}
    >
      <h4 className="font-medium text-sm">通话指标</h4>
      <p className="mt-1 text-muted-foreground text-xs leading-normal">
        从 user 说完到 agent 开口的端到端延迟，以及各 pipeline 段累计用量。
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <section className="space-y-2 text-sm">
          <h5 className="font-medium text-foreground text-xs uppercase tracking-wide">
            端到端延迟
          </h5>
          <DetailRow label="样本数" value={`${e2eLatencies.length} 轮`} />
          <DetailRow label="p50" value={formatSeconds(e2eP50)} />
          <DetailRow label="p95" value={formatSeconds(e2eP95)} />
          <DetailRow
            label="EOU 平均"
            value={formatSeconds(eouAvg)}
            valueClassName="text-muted-foreground"
          />
          <DetailRow
            label="转写平均"
            value={formatSeconds(transcriptionAvg)}
            valueClassName="text-muted-foreground"
          />
        </section>

        <section className="space-y-2 text-sm">
          <h5 className="font-medium text-foreground text-xs uppercase tracking-wide">LLM</h5>
          <DetailRow label="请求数" value={formatNumber(llm.request_count)} />
          <DetailRow label="首 token 平均" value={formatSeconds(llmAvgTtft)} />
          <DetailRow label="累计 token" value={formatNumber(llm.total_tokens)} />
          <DetailRow
            label="prompt / completion"
            value={`${formatNumber(llm.total_prompt_tokens)} / ${formatNumber(
              llm.total_completion_tokens,
            )}`}
            valueClassName="text-muted-foreground"
          />
        </section>

        <section className="space-y-2 text-sm">
          <h5 className="font-medium text-foreground text-xs uppercase tracking-wide">TTS</h5>
          <DetailRow label="请求数" value={formatNumber(tts.request_count)} />
          <DetailRow label="首音平均" value={formatSeconds(ttsAvgTtfb)} />
          <DetailRow label="累计字符" value={formatNumber(tts.total_characters)} />
          <DetailRow
            label="累计音频"
            value={formatSeconds(tts.total_audio_duration)}
            valueClassName="text-muted-foreground"
          />
        </section>

        <section className="space-y-2 text-sm">
          <h5 className="font-medium text-foreground text-xs uppercase tracking-wide">
            STT / 打断
          </h5>
          <DetailRow label="STT 请求数" value={formatNumber(stt.request_count)} />
          <DetailRow
            label="STT 累计音频"
            value={formatSeconds(stt.total_audio_duration)}
            valueClassName="text-muted-foreground"
          />
          <DetailRow label="打断次数" value={formatNumber(interruption.num_interruptions)} />
          <DetailRow
            label="附和(backchannel)"
            value={formatNumber(interruption.num_backchannels)}
            valueClassName="text-muted-foreground"
          />
        </section>
      </div>
    </Component>
  );
}
