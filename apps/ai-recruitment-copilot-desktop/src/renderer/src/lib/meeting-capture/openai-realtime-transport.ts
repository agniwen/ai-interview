// oxlint-disable promise/avoid-new -- RTCDataChannel readiness is exposed only through DOM events.
import type { MeetingLiveTranscriptAuthorization } from "@arc/shared/meeting-transcription";
import type { LiveTranscriptConnection } from "./live-transcript-draft";

const MAX_DATA_CHANNEL_BUFFERED_BYTES = 256 * 1024;
const DATA_CHANNEL_LOW_WATER_BYTES = 64 * 1024;
const CONNECTION_TIMEOUT_MS = 10_000;

function pcm16ToBase64(frame: Int16Array): string {
  const bytes = new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
}

function waitForDataChannelOpen(channel: RTCDataChannel): Promise<void> {
  if (channel.readyState === "open") {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("OpenAI realtime data channel timed out"));
    }, CONNECTION_TIMEOUT_MS);
    channel.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    channel.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("OpenAI realtime data channel failed"));
      },
      { once: true },
    );
  });
}

export async function connectOpenAiRealtimeTranscription(input: {
  authorization: MeetingLiveTranscriptAuthorization;
  fetch?: typeof globalThis.fetch;
  onDisconnect: (reason: string) => void;
  onTranscript: (event: { itemId: string; text: string; type: "completed" | "delta" }) => void;
  onWritable: () => void;
}): Promise<LiveTranscriptConnection> {
  const fetch = input.fetch ?? globalThis.fetch;
  const peer = new RTCPeerConnection();
  const channel = peer.createDataChannel("oai-events");
  channel.bufferedAmountLowThreshold = DATA_CHANNEL_LOW_WATER_BYTES;
  let closing = false;
  const disconnect = (reason: string) => {
    if (!closing) {
      input.onDisconnect(reason);
    }
  };
  channel.addEventListener("close", () => disconnect("provider-disconnected"));
  channel.addEventListener("error", () => disconnect("provider-error"));
  channel.addEventListener("bufferedamountlow", input.onWritable);
  channel.addEventListener("message", (message) => {
    if (typeof message.data !== "string") {
      return;
    }
    try {
      const event = JSON.parse(message.data) as Record<string, unknown>;
      if (
        event.type === "conversation.item.input_audio_transcription.delta" &&
        typeof event.item_id === "string" &&
        typeof event.delta === "string"
      ) {
        input.onTranscript({ itemId: event.item_id, text: event.delta, type: "delta" });
      }
      if (
        event.type === "conversation.item.input_audio_transcription.completed" &&
        typeof event.item_id === "string" &&
        typeof event.transcript === "string"
      ) {
        input.onTranscript({
          itemId: event.item_id,
          text: event.transcript,
          type: "completed",
        });
      }
      if (event.type === "error") {
        disconnect("provider-error");
      }
    } catch {
      // Ignore malformed provider events without affecting the recording path.
    }
  });
  peer.addEventListener("connectionstatechange", () => {
    if (["closed", "disconnected", "failed"].includes(peer.connectionState)) {
      disconnect("network-lost");
    }
  });

  try {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      body: offer.sdp ?? "",
      headers: {
        Authorization: `Bearer ${input.authorization.clientSecret}`,
        "Content-Type": "application/sdp",
      },
      method: "POST",
      signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`OpenAI realtime connection failed with HTTP ${response.status}`);
    }
    await peer.setRemoteDescription({ sdp: await response.text(), type: "answer" });
    await waitForDataChannelOpen(channel);
  } catch (error) {
    closing = true;
    channel.close();
    peer.close();
    throw error;
  }

  return {
    close: () => {
      closing = true;
      channel.close();
      peer.close();
    },
    sendPcm: (frame) => {
      if (
        channel.readyState !== "open" ||
        channel.bufferedAmount + frame.byteLength * 2 > MAX_DATA_CHANNEL_BUFFERED_BYTES
      ) {
        return false;
      }
      try {
        channel.send(
          JSON.stringify({ audio: pcm16ToBase64(frame), type: "input_audio_buffer.append" }),
        );
        return true;
      } catch {
        return false;
      }
    },
  };
}
