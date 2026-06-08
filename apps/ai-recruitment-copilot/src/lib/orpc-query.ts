import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import { orpc } from "./orpc";

export const orpcQuery = createTanstackQueryUtils(orpc, {
  path: ["orpc"],
});
