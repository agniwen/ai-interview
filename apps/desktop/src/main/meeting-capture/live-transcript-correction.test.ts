// oxlint-disable promise/avoid-new -- Deferred requests exercise in-flight cancellation.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveCorrectionBatch } from "@app/shared/meeting-live-correction";
import {
  createLiveTranscriptCorrection,
  LIVE_CORRECTION_MODEL,
  LIVE_CORRECTION_LLM,
} from "./live-transcript-correction";

const batch: LiveCorrectionBatch = {
  batchId: "00000000-0000-4000-8000-000000000001",
  blocks: [0, 1, 2].map((i) => ({
    id: `section:${i}`,
    itemId: String(i),
    originalText: `实时${i}`,
    sectionId: "section",
    track: i === 1 ? "system" : "microphone",
  })),
  context: { after: [], before: ["前文"] },
};
const corrected = batch.blocks.map((block, i) => ({ id: block.id, text: `校正${i}` }));
const asr = () => Response.json({ output: { text: "完整合并音频识别" } });
const llm = (blocks: { id: string; text: null | string }[] = corrected) =>
  Response.json({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ blocks }) } }],
  });
const clips = [1, 2, 3].map((value) => Buffer.alloc(32_000, value));
function setup(
  fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(asr())
    .mockResolvedValueOnce(llm()),
) {
  const onEvent = vi.fn();
  const sidecar = createLiveTranscriptCorrection({ fetch });
  const request = {
    baseUrl: "https://dashscope.aliyuncs.com",
    batch,
    clips,
    getContext: () => ({ after: ["ASR 期间的新后文"], before: ["前文已校正"] }),
    onEvent,
    token: "temporary-token",
  };
  return { fetch, onEvent, request, sidecar };
}
afterEach(() => vi.useRealTimers());
describe("one-to-three-block audio correction", () => {
  it("flushes a single trailing block through the same conservative correction path", async () => {
    const trailingBatch = { ...batch, blocks: batch.blocks.slice(0, 1) };
    const trailingResult = corrected.slice(0, 1);
    const { sidecar, onEvent, request } = setup(
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(asr())
        .mockResolvedValueOnce(llm(trailingResult)),
    );

    sidecar.correct({ ...request, batch: trailingBatch, clips: clips.slice(0, 1) });

    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledOnce());
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ blocks: trailingResult, status: "completed" }),
    );
    sidecar.close();
  });

  it("concatenates three cross-track clips into ONE ASR request then ONE contextual LLM request", async () => {
    const lookahead = {
      id: "section:3",
      itemId: "3",
      originalText: "右侧后半句",
      sectionId: "section",
      track: "microphone" as const,
    };
    const lookaheadClip = Buffer.alloc(16_000, 4);
    const { sidecar, fetch, onEvent, request } = setup();
    sidecar.correct({
      ...request,
      batch: { ...request.batch, lookahead },
      lookaheadClip,
    });
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.model).toBe(LIVE_CORRECTION_MODEL);
    const wav = Buffer.from(
      body.input.messages.at(-1).content[0].input_audio.data.split(",")[1],
      "base64",
    );
    expect(wav.readUInt32LE(24)).toBe(16_000);
    expect(wav.subarray(44)).toEqual(Buffer.concat([...clips, lookaheadClip]));
    const asrContext = body.input.messages
      .slice(0, -1)
      .flatMap((message: { content: { text?: string }[] }) =>
        message.content.flatMap((content) => (content.text ? [content.text] : [])),
      );
    expect(asrContext).toEqual(["前文"]);
    const llmBody = JSON.parse(String(fetch.mock.calls[1][1]?.body));
    expect(llmBody.model).toBe(LIVE_CORRECTION_LLM);
    expect(llmBody.messages[0].content).toContain("独立重听");
    expect(llmBody.messages[0].content).toContain("不能默认保留实时原文");
    expect(llmBody.messages[0].content).toContain("重新分配相邻且相同音轨 block 的句首或句尾文本");
    expect(llmBody.messages[0].content).toContain("校正结果就是最终采用文本");
    const prompt = JSON.parse(llmBody.messages[1].content);
    expect(prompt).toMatchObject({
      combinedTranscript: "完整合并音频识别",
      context: request.getContext(),
      lookaheadAudio: {
        endMs: 3500,
        startMs: 3000,
        text: "右侧后半句",
      },
    });
    expect(prompt.blocks.map((block: { id: string }) => block.id)).toEqual(
      batch.blocks.map((block) => block.id),
    );
    expect(onEvent).toHaveBeenCalledWith({
      batchId: batch.batchId,
      blocks: corrected,
      model: `${LIVE_CORRECTION_MODEL}+${LIVE_CORRECTION_LLM}`,
      status: "completed",
      type: "meeting.transcription.correction-batch",
    });
    sidecar.correct(request);
    expect(fetch).toHaveBeenCalledTimes(2);
    sidecar.close();
  });
  it.each(
    [
      [],
      corrected.slice(0, 2),
      [corrected[0], corrected[0], corrected[2]],
      [{ id: "wrong", text: "x" }, ...corrected.slice(1)],
    ].map((blocks) => ({ blocks })),
  )(
    "rejects incomplete or mismatched LLM block IDs without partial updates: %j",
    async ({ blocks }) => {
      const { sidecar, onEvent, request } = setup(
        vi
          .fn<typeof globalThis.fetch>()
          .mockResolvedValueOnce(asr())
          .mockResolvedValueOnce(llm(blocks)),
      );
      sidecar.correct(request);
      await vi.waitFor(() =>
        expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ status: "finished" })),
      );
      expect(onEvent).toHaveBeenCalledOnce();
      sidecar.close();
    },
  );
  it("does not submit partial audio when any of the three clips is unavailable", () => {
    const { sidecar, fetch, onEvent, request } = setup();
    sidecar.correct({ ...request, clips: [clips[0], null, clips[2]] });
    expect(fetch).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ status: "finished" }));
    sidecar.close();
  });
  it("treats the model result as authoritative across adjacent block boundaries", async () => {
    const boundaryBatch: LiveCorrectionBatch = {
      ...batch,
      blocks: batch.blocks.map((block, index) => ({
        ...block,
        originalText: ["这句话说到这里其实", "还没有结束", "错误噪音"][index] ?? block.originalText,
      })),
    };
    const proposed = [
      { id: boundaryBatch.blocks[0].id, text: "这句话说到这里" },
      { id: boundaryBatch.blocks[1].id, text: "其实还没有结束" },
      { id: boundaryBatch.blocks[2].id, text: null },
    ];
    const { sidecar, onEvent, request } = setup(
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(
          Response.json({ output: { text: "这句话说到这里，其实还没有结束。" } }),
        )
        .mockResolvedValueOnce(llm(proposed)),
    );
    sidecar.correct({ ...request, batch: boundaryBatch });
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledOnce());
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: proposed,
        status: "completed",
      }),
    );
    sidecar.close();
  });
  it("aborts either stage and clears pending status without delivering late text", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const { sidecar, fetch, onEvent, request } = setup(
      vi.fn<typeof globalThis.fetch>().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );
    sidecar.correct(request);
    sidecar.close();
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ status: "finished" }));
    resolveRequest?.(asr());
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledOnce();
  });
  it("keeps realtime text on provider failure", async () => {
    const { sidecar, onEvent, request } = setup(
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status: 429 })),
    );
    sidecar.correct(request);
    await vi.waitFor(() =>
      expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ status: "finished" })),
    );
    sidecar.close();
  });
  it("bounds queued batches, clearing evicted and cancelled work exactly once", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRequest = resolve;
          }),
      )
      .mockImplementation((_url, options) => {
        const body = JSON.parse(String(options?.body));
        if (body.model === LIVE_CORRECTION_MODEL) {
          return Promise.resolve(asr());
        }
        const data = JSON.parse(body.messages[1].content);
        return Promise.resolve(
          llm(data.blocks.map((block: { id: string }) => ({ id: block.id, text: "校正" }))),
        );
      });
    const { sidecar, onEvent, request } = setup(fetch);
    for (let index = 0; index < 6; index += 1) {
      sidecar.correct({
        ...request,
        batch: { ...batch, batchId: `00000000-0000-4000-8000-00000000000${index}` },
      });
    }
    expect(fetch).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        batchId: "00000000-0000-4000-8000-000000000001",
        status: "finished",
      }),
    );
    resolveRequest?.(asr());
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(6));
    expect(fetch).toHaveBeenCalledTimes(10);
    sidecar.close();
    expect(onEvent).toHaveBeenCalledTimes(6);
  });

  it("cancels during the LLM stage and ignores its late response", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(asr())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRequest = resolve;
          }),
      );
    const { sidecar, request, onEvent } = setup(fetch);
    sidecar.correct(request);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    sidecar.cancelSection("unrelated");
    expect(onEvent).not.toHaveBeenCalled();
    sidecar.cancelSection("section");
    sidecar.cancelSection("section");
    expect(fetch.mock.calls[1][1]?.signal?.aborted).toBe(true);
    expect(onEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ status: "finished" }),
    );
    resolveRequest?.(llm());
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(onEvent).toHaveBeenCalledOnce();
    sidecar.close();
  });
});
