import { listUpstreamModelIds } from "@/server/agents/list-upstream-models";
import {
  describeModelId,
  HARDCODED_DEFAULT_MODEL_ID,
  isChatCapableId,
  SECONDARY_DEFAULT_MODEL_ID,
} from "@/server/agents/model-catalog";
import { factory } from "@/server/factory";

const DASHSCOPE_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

export const modelsRouter = factory.createApp().get("/", async (c) => {
  const apiKey = process.env.ALIBABA_API_KEY;
  if (!apiKey) {
    return c.json({ error: "Missing ALIBABA_API_KEY" }, 500);
  }
  const baseURL = process.env.ALIBABA_BASE_URL?.trim() || DASHSCOPE_DEFAULT_BASE_URL;

  const upstreamIds = await listUpstreamModelIds({ apiKey, baseURL });

  // 完全跟随上游：能拉到就过滤掉非聊天 id 后展示，拉不到就返回空 + reachable=false。
  // Source of truth = upstream `/models`. Filter out non-chat ids; on failure
  // we return an empty list and surface `upstreamReachable: false` to the UI.
  const models = upstreamIds
    ? [...upstreamIds]
        .filter((id) => isChatCapableId(id))
        .toSorted()
        .map(describeModelId)
    : [];

  // 默认 id 兜底链：硬编码 > 二级兜底（qwen-plus-latest）> 列表第一个。
  // Default id fallback chain: HARDCODED → SECONDARY (qwen-plus-latest) →
  // first listed model.
  const defaultId = (() => {
    if (models.some((m) => m.id === HARDCODED_DEFAULT_MODEL_ID)) {
      return HARDCODED_DEFAULT_MODEL_ID;
    }
    if (models.some((m) => m.id === SECONDARY_DEFAULT_MODEL_ID)) {
      return SECONDARY_DEFAULT_MODEL_ID;
    }
    return models[0]?.id ?? HARDCODED_DEFAULT_MODEL_ID;
  })();

  return c.json({ defaultId, models, upstreamReachable: upstreamIds !== null }, 200);
});
