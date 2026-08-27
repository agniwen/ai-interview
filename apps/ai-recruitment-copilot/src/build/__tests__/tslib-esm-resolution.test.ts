import { describe, expect, it } from "vitest";
import { shouldResolveTslibAsEsm } from "../tslib-esm-resolution";

describe("tslib ESM resolution", () => {
  it.each([
    "/repo/node_modules/.bun/bullmq@5.78.0/node_modules/bullmq/dist/esm/classes/queue.js",
    "/repo/node_modules/.bun/@aws-crypto+crc32@5.2.0/node_modules/@aws-crypto/crc32/build/module/index.js",
    "/repo/node_modules/.bun/@aws-sdk+client-s3@3.1053.0/node_modules/@aws-sdk/client-s3/dist-es/index.js",
    "/repo/node_modules/.bun/@smithy+core@3.24.4/node_modules/@smithy/core/dist-es/submodules/event-streams/index.js",
    "C:\\repo\\node_modules\\@smithy\\core\\dist-es\\submodules\\event-streams\\index.js",
  ])("uses tslib's ESM entry for %s", (importer) => {
    expect(shouldResolveTslibAsEsm("tslib", importer)).toBe(true);
  });

  it("does not rewrite unrelated tslib imports", () => {
    expect(
      shouldResolveTslibAsEsm("tslib", "/repo/node_modules/example-package/dist/index.js"),
    ).toBe(false);
  });

  it("does not rewrite other module specifiers", () => {
    expect(
      shouldResolveTslibAsEsm(
        "another-package",
        "/repo/node_modules/@smithy/core/dist-es/submodules/event-streams/index.js",
      ),
    ).toBe(false);
  });
});
