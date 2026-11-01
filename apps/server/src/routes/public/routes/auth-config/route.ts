import { factory } from "../../../../factory";
import { getFeishuLoginProviderIds } from "@app/feishu/provider";

export const authConfigRouter = factory.createApp().get("/", (c) =>
  c.json({
    feishuLoginProviderIds: getFeishuLoginProviderIds(),
  }),
);
