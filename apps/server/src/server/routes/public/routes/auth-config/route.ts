import { factory } from "../../../../factory";
import { getFeishuLoginProviderIds } from "../../../../integrations/feishu/provider";

export const authConfigRouter = factory.createApp().get("/", (c) =>
  c.json({
    feishuLoginProviderIds: getFeishuLoginProviderIds(),
  }),
);
