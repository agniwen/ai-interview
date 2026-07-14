import type { MastraDBMessage, MastraMessagePart } from "@mastra/core/agent/message-list";
import { describe, expect, it } from "vitest";

import {
  buildGlobalOmPartsByCycleId,
  convertOmPartsInMastraMessage,
  injectBufferingEnds,
  markOmMarkersAsDisconnected,
  normalizeOmCycle,
  scanOmInitialState,
  hasInProgressBufferingMarkers,
} from "../om-parts-converter";

/**
 * Build a `data-om-*` part. `data-${string}` parts are first-class
 * `MastraMessagePart` union members, so no cast is needed.
 */
const omPart = (name: string, data: Record<string, unknown>): MastraMessagePart => ({
  data,
  type: `data-${name}`,
});

const assistantMessage = (parts: MastraMessagePart[], id = "msg-1"): MastraDBMessage => ({
  content: { format: 2, metadata: {}, parts },
  createdAt: new Date("2026-05-29T00:00:00.000Z"),
  id,
  resourceId: "resource-1",
  role: "assistant",
  threadId: "thread-1",
});

const partsOf = (message: MastraDBMessage) =>
  message.content.parts as { type: string; data?: any }[];

const convertedOmData = (message: MastraDBMessage) => {
  const part = message.content.parts.find((part: any) => part.type === "dynamic-tool");
  return (part as any)?.output?.omData;
};

describe("OM part conversion", () => {
  it("retains terminal extraction fields across a post-stream reset with a poorer snapshot", () => {
    const cache = new Map();
    const streamedMessages = [
      assistantMessage([
        omPart("om-buffering-start", { cycleId: "cycle-reset", operationType: "observation" }),
        omPart("om-buffering-end", {
          cycleId: "cycle-reset",
          extractedValues: { priority: "high" },
          extractionFailures: [{ error: "missing value", slug: "status" }],
          observations: ["observed"],
          operationType: "observation",
          tokensBuffered: 20,
        }),
      ]),
    ];

    const streamedGlobalParts = buildGlobalOmPartsByCycleId(streamedMessages, cache);
    const streamedMessage = convertOmPartsInMastraMessage(streamedMessages[0], streamedGlobalParts);
    expect(convertedOmData(streamedMessage)?.extractedValues).toEqual({ priority: "high" });

    const resetMessages = [
      assistantMessage([
        omPart("om-buffering-start", { cycleId: "cycle-reset", operationType: "observation" }),
        omPart("om-buffering-end", {
          cycleId: "cycle-reset",
          observations: ["observed"],
          operationType: "observation",
          tokensBuffered: 20,
        }),
      ]),
    ];

    const resetGlobalParts = buildGlobalOmPartsByCycleId(resetMessages, cache);
    const resetMessage = convertOmPartsInMastraMessage(resetMessages[0], resetGlobalParts);
    expect(convertedOmData(resetMessage)?.extractedValues).toEqual({ priority: "high" });
    expect(convertedOmData(resetMessage)?.extractionFailures).toEqual([
      { error: "missing value", slug: "status" },
    ]);
  });

  it("retains cached extraction fields when a buffering reset snapshot has empty extraction fields", () => {
    const cache = new Map();
    const streamedMessages = [
      assistantMessage([
        omPart("om-buffering-start", {
          cycleId: "cycle-empty-reset",
          operationType: "observation",
        }),
        omPart("om-buffering-end", {
          cycleId: "cycle-empty-reset",
          extractedValues: { priority: "high" },
          extractionFailures: [{ error: "missing value", slug: "status" }],
          operationType: "observation",
        }),
      ]),
    ];

    buildGlobalOmPartsByCycleId(streamedMessages, cache);

    const resetMessages = [
      assistantMessage([
        omPart("om-buffering-start", {
          cycleId: "cycle-empty-reset",
          operationType: "observation",
        }),
        omPart("om-buffering-end", {
          cycleId: "cycle-empty-reset",
          extractedValues: {},
          extractionFailures: [],
          operationType: "observation",
        }),
      ]),
    ];

    const resetGlobalParts = buildGlobalOmPartsByCycleId(resetMessages, cache);
    const resetMessage = convertOmPartsInMastraMessage(resetMessages[0], resetGlobalParts);
    expect(convertedOmData(resetMessage)?.extractedValues).toEqual({ priority: "high" });
    expect(convertedOmData(resetMessage)?.extractionFailures).toEqual([
      { error: "missing value", slug: "status" },
    ]);
  });

  it("retains cached extraction fields when an observation reset snapshot has empty extraction fields", () => {
    const cache = new Map();
    const streamedMessages = [
      assistantMessage([
        omPart("om-observation-start", {
          cycleId: "cycle-observation-reset",
          operationType: "observation",
        }),
        omPart("om-observation-end", {
          cycleId: "cycle-observation-reset",
          extractedValues: { status: "complete" },
          extractionFailures: [{ error: "missing value", slug: "priority" }],
          operationType: "observation",
        }),
      ]),
    ];

    buildGlobalOmPartsByCycleId(streamedMessages, cache);

    const resetMessages = [
      assistantMessage([
        omPart("om-observation-start", {
          cycleId: "cycle-observation-reset",
          operationType: "observation",
        }),
        omPart("om-observation-end", {
          cycleId: "cycle-observation-reset",
          extractedValues: {},
          extractionFailures: [],
          operationType: "observation",
        }),
      ]),
    ];

    const resetGlobalParts = buildGlobalOmPartsByCycleId(resetMessages, cache);
    const resetMessage = convertOmPartsInMastraMessage(resetMessages[0], resetGlobalParts);
    expect(convertedOmData(resetMessage)?.extractedValues).toEqual({ status: "complete" });
    expect(convertedOmData(resetMessage)?.extractionFailures).toEqual([
      { error: "missing value", slug: "priority" },
    ]);
  });

  it("renders extraction failures consistently on failed observation cycles", () => {
    const messages = [
      assistantMessage([
        omPart("om-observation-start", {
          cycleId: "cycle-failed-render",
          operationType: "observation",
        }),
        omPart("om-observation-failed", {
          cycleId: "cycle-failed-render",
          error: "model failed",
          extractionFailures: [{ error: "missing value", slug: "priority" }],
          operationType: "observation",
        }),
      ]),
    ];

    const globalParts = buildGlobalOmPartsByCycleId(messages);
    const convertedMessage = convertOmPartsInMastraMessage(messages[0], globalParts);
    expect(convertedOmData(convertedMessage)?._state).toBe("failed");
    expect(convertedOmData(convertedMessage)?.extractionFailures).toEqual([
      { error: "missing value", slug: "priority" },
    ]);
  });

  it("keeps a completed buffering marker at the original start position after reload", () => {
    const messages = [
      assistantMessage(
        [
          { text: "Before memory marker", type: "text" },
          omPart("om-buffering-start", { cycleId: "cycle-first", operationType: "observation" }),
          { text: "After memory marker", type: "text" },
        ],
        "msg-first",
      ),
      assistantMessage(
        [
          { text: "Later assistant response", type: "text" },
          omPart("om-buffering-end", {
            cycleId: "cycle-first",
            extractedValues: { workingMemory: { location: "Sooke" } },
            observations: ["later observation"],
            operationType: "observation",
          }),
        ],
        "msg-second",
      ),
    ];

    const globalParts = buildGlobalOmPartsByCycleId(messages);
    const firstMessage = convertOmPartsInMastraMessage(messages[0], globalParts);
    const secondMessage = convertOmPartsInMastraMessage(messages[1], globalParts);

    expect(firstMessage.content.parts.map((part) => part.type)).toEqual([
      "text",
      "dynamic-tool",
      "text",
    ]);
    expect(convertedOmData(firstMessage)?.observations).toEqual(["later observation"]);
    expect(convertedOmData(firstMessage)?.extractedValues).toEqual({
      workingMemory: { location: "Sooke" },
    });
    expect(secondMessage.content.parts).toEqual([
      { text: "Later assistant response", type: "text" },
    ]);
  });
});

describe("normalizeOmCycle", () => {
  it("normalizes live, completed, refetched, and reloaded buffering states", () => {
    const start = omPart("om-buffering-start", {
      cycleId: "cycle-buffer",
      operationType: "observation",
    }) as any;
    expect(normalizeOmCycle("cycle-buffer", { bufferingStart: start }, "buffering")).toMatchObject({
      cycleId: "cycle-buffer",
      isLoading: true,
      status: "buffering",
    });

    const end = omPart("om-buffering-end", {
      cycleId: "cycle-buffer",
      extractedValues: { priority: "high" },
      observations: ["observed"],
      operationType: "observation",
    }) as any;
    expect(
      normalizeOmCycle("cycle-buffer", { bufferingEnd: end, bufferingStart: start }, "buffering"),
    ).toMatchObject({
      extractedValues: { priority: "high" },
      isLoading: false,
      observations: ["observed"],
      status: "buffering-complete",
    });

    const activation = omPart("om-activation", {
      cycleId: "cycle-buffer",
      operationType: "observation",
      tokensActivated: 42,
    }) as any;
    expect(
      normalizeOmCycle(
        "cycle-buffer",
        { activation, bufferingEnd: end, bufferingStart: start },
        "buffering",
      ),
    ).toMatchObject({
      extractedValues: { priority: "high" },
      isLoading: false,
      omData: { extractedValues: { priority: "high" }, tokensObserved: 42 },
      status: "buffering-complete",
    });
  });

  it("normalizes observation failure state with extraction failures", () => {
    const start = omPart("om-observation-start", {
      cycleId: "cycle-failed",
      operationType: "observation",
    }) as any;
    const failed = omPart("om-observation-failed", {
      cycleId: "cycle-failed",
      error: "model failed",
      extractionFailures: [{ error: "missing value", slug: "priority" }],
      operationType: "observation",
    }) as any;

    expect(normalizeOmCycle("cycle-failed", { failed, start }, "observation")).toMatchObject({
      cycleId: "cycle-failed",
      extractionFailures: [{ error: "missing value", slug: "priority" }],
      isLoading: false,
      status: "failed",
    });
  });
});

describe("markOmMarkersAsDisconnected", () => {
  it("marks an in-progress observation-start marker as disconnected (reads content.parts)", () => {
    const [message] = markOmMarkersAsDisconnected([
      assistantMessage([omPart("om-observation-start", { cycleId: "cycle-1" })]),
    ]);

    const part = partsOf(message)[0];
    expect(part.type).toBe("data-om-observation-start");
    expect(part.data?._state).toBe("disconnected");
    expect(typeof part.data?.disconnectedAt).toBe("string");
  });

  it("leaves user messages untouched", () => {
    const userMessage: MastraDBMessage = {
      ...assistantMessage([omPart("om-observation-start", { cycleId: "cycle-1" })], "user-1"),
      role: "user",
    };
    const [message] = markOmMarkersAsDisconnected([userMessage]);
    expect(partsOf(message)[0].data?._state).toBeUndefined();
  });

  it("does not mark completed observation cycles as disconnected", () => {
    const [message] = markOmMarkersAsDisconnected([
      assistantMessage([
        omPart("om-observation-start", { cycleId: "cycle-done" }),
        omPart("om-observation-end", {
          completedAt: "2026-05-29T00:00:01.000Z",
          cycleId: "cycle-done",
        }),
      ]),
    ]);

    expect(partsOf(message)[0].data?.disconnectedAt).toBeUndefined();
    expect(partsOf(message)[0].data?._state).toBeUndefined();
  });

  it("does not mark buffering cycles with a later activation as disconnected", () => {
    const messages = [
      assistantMessage([omPart("om-buffering-start", { cycleId: "cycle-activated" })], "msg-start"),
      assistantMessage([omPart("om-activation", { cycleId: "cycle-activated" })], "msg-activation"),
    ];
    const [startMessage] = markOmMarkersAsDisconnected(messages);

    expect(partsOf(startMessage)[0].data?.disconnectedAt).toBeUndefined();
    expect(partsOf(startMessage)[0].data?._state).toBeUndefined();
    expect(hasInProgressBufferingMarkers(messages)).toBe(false);
  });
});

describe("injectBufferingEnds", () => {
  it("injects a synthetic buffering-end for an in-progress buffering-start (reads content.parts)", () => {
    const [message] = injectBufferingEnds(
      [
        assistantMessage([
          omPart("om-buffering-start", { cycleId: "cycle-2", operationType: "observation" }),
        ]),
      ],
      {
        bufferedObservationChunks: [
          {
            cycleId: "cycle-2",
            extractedValues: { priority: "high" },
            extractionFailures: [{ error: "missing value", slug: "status" }],
            messageTokens: 120,
            observations: ["x"],
            tokenCount: 40,
          },
        ],
      },
    );

    const parts = partsOf(message);
    expect(parts).toHaveLength(2);
    expect(parts[1].type).toBe("data-om-buffering-end");
    expect(parts[1].data?.cycleId).toBe("cycle-2");
    expect(parts[1].data?.tokensBuffered).toBe(120);
    expect(parts[1].data?.observations).toEqual(["x"]);
    expect(parts[1].data?.extractedValues).toEqual({ priority: "high" });
    expect(parts[1].data?.extractionFailures).toEqual([{ error: "missing value", slug: "status" }]);
  });

  it("does not inject an end for an already-disconnected buffering-start", () => {
    const [message] = injectBufferingEnds([
      assistantMessage([
        omPart("om-buffering-start", { cycleId: "cycle-3", disconnectedAt: "yes" }),
      ]),
    ]);
    expect(partsOf(message)).toHaveLength(1);
  });

  it("does not duplicate synthetic buffering-end parts when called repeatedly", () => {
    const messages = [
      assistantMessage([
        omPart("om-buffering-start", { cycleId: "cycle-repeat", operationType: "observation" }),
      ]),
    ];

    const once = injectBufferingEnds(messages);
    const twice = injectBufferingEnds(once);

    expect(partsOf(twice[0]).filter((part) => part.type === "data-om-buffering-end")).toHaveLength(
      1,
    );
  });

  it("does not inject an end when the cycle already has a terminal marker later", () => {
    const [message] = injectBufferingEnds([
      assistantMessage([
        omPart("om-buffering-start", { cycleId: "cycle-complete", operationType: "observation" }),
        omPart("om-buffering-end", {
          completedAt: "2026-05-29T00:00:01.000Z",
          cycleId: "cycle-complete",
        }),
      ]),
    ]);

    expect(partsOf(message).filter((part) => part.type === "data-om-buffering-end")).toHaveLength(
      1,
    );
  });
});

describe("scanOmInitialState", () => {
  it("collects activation cycle ids and the last progress part from content.parts", () => {
    const { activatedCycleIds, lastProgress } = scanOmInitialState([
      assistantMessage([
        omPart("om-activation", { cycleId: "cycle-a" }),
        omPart("om-status", { tokensObserved: 100 }),
        omPart("om-status", { tokensObserved: 250 }),
      ]),
    ]);

    expect(activatedCycleIds).toEqual(["cycle-a"]);
    expect(lastProgress).toEqual({ tokensObserved: 250 });
  });
});
