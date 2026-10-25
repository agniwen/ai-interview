"use client";

/**
 * 录像与对话记录之间的播放联动。
 * 播放器上报当前播放时间并消费跳转请求；对话记录读取当前时间来高亮当前句，并在点击时间戳时发起跳转。
 * 用外部 store + useSyncExternalStore，让对话记录只在“当前句”变化时重渲染，而不是每次 timeupdate。
 *
 * Playback link between the recording player and the transcript. The player
 * publishes its current time and consumes seek requests; the transcript reads
 * the time to highlight the current turn and requests seeks from timestamps.
 * An external store keeps transcript re-renders to current-turn changes only.
 */

import { createContext, useContext, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

export interface RecordingSeekRequest {
  id: number;
  secs: number;
}

export interface RecordingPlaybackState {
  /** 录像可播放（已生成且已挂载播放器）。Recording exists and a player is mounted. */
  available: boolean;
  currentTimeSecs: number | null;
  playing: boolean;
  seekRequest: RecordingSeekRequest | null;
}

export interface RecordingPlaybackStore {
  getState: () => RecordingPlaybackState;
  requestSeek: (secs: number) => void;
  setAvailable: (available: boolean) => void;
  setProgress: (progress: { currentTimeSecs: number; playing: boolean }) => void;
  subscribe: (listener: () => void) => () => void;
}

const initialState: RecordingPlaybackState = {
  available: false,
  currentTimeSecs: null,
  playing: false,
  seekRequest: null,
};

export function createRecordingPlaybackStore(): RecordingPlaybackStore {
  let state = initialState;
  let nextSeekId = 1;
  const listeners = new Set<() => void>();

  const update = (patch: Partial<RecordingPlaybackState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    getState: () => state,
    requestSeek: (secs) => {
      update({ seekRequest: { id: nextSeekId, secs: Math.max(0, secs) } });
      nextSeekId += 1;
    },
    setAvailable: (available) => {
      if (state.available !== available) {
        update({ available });
      }
    },
    setProgress: ({ currentTimeSecs, playing }) => {
      if (state.currentTimeSecs !== currentTimeSecs || state.playing !== playing) {
        update({ currentTimeSecs, playing });
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const RecordingPlaybackContext = createContext<RecordingPlaybackStore | null>(null);

export function RecordingPlaybackProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createRecordingPlaybackStore);
  return (
    <RecordingPlaybackContext.Provider value={store}>{children}</RecordingPlaybackContext.Provider>
  );
}

export function useRecordingPlaybackStore() {
  return useContext(RecordingPlaybackContext);
}

const getInitialState = () => initialState;
const noopSubscribe = () => () => {
  // 不在 Provider 内时没有订阅需要释放。Nothing to release outside a provider.
};

/**
 * 读取播放状态的派生值；不在 Provider 内时按初始状态计算。
 * Select a derived value from playback state; falls back to the initial state
 * outside a provider.
 */
export function useRecordingPlayback<T>(selector: (state: RecordingPlaybackState) => T): T {
  const store = useRecordingPlaybackStore();
  const getSnapshot = store ? store.getState : getInitialState;
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => selector(getSnapshot()),
    () => selector(initialState),
  );
}
