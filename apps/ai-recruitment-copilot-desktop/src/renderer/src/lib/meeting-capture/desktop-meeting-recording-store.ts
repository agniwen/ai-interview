// oxlint-disable class-methods-use-this, promise/avoid-new -- This adapter implements an instance port and converts MessagePort acknowledgements to promises.
import type {
  AppendLocalFragmentInput,
  BeginLocalCaptureInput,
  LocalSavedMeeting,
  MeetingRecordingStore,
  RecoverableMeetingCapture,
} from "../../../../preload/meeting-capture";
import type {
  FragmentWriteRequest,
  FragmentWriteResponse,
} from "../../../../preload/meeting-capture-api";

const WRITE_TIMEOUT_MS = 30_000;

interface PendingWrite {
  reject: (error: Error) => void;
  resolve: () => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class DesktopMeetingRecordingStore implements MeetingRecordingStore {
  private readonly pending = new Map<string, PendingWrite>();
  private readonly port: MessagePort;

  constructor() {
    const { port1: clientPort, port2: serverPort } = new MessageChannel();
    this.port = clientPort;
    this.port.addEventListener("message", (event: MessageEvent<FragmentWriteResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timeout);
      this.pending.delete(response.id);
      if (response.ok) {
        pending.resolve();
      } else {
        pending.reject(new Error(response.error));
      }
    });
    this.port.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("本地录音写入通道已关闭"));
      }
      this.pending.clear();
    });
    this.port.start();
    window.postMessage("start-meeting-capture-fragment-client", "*", [serverPort]);
  }

  begin(input: BeginLocalCaptureInput): Promise<void> {
    return window.api.meetingCapture.begin(input);
  }

  append(input: AppendLocalFragmentInput, bytes: Uint8Array): Promise<void> {
    const id = crypto.randomUUID();
    const transferable = Uint8Array.from(bytes).buffer;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("本地录音分片落盘超时"));
      }, WRITE_TIMEOUT_MS);
      this.pending.set(id, { reject, resolve, timeout });
      const request: FragmentWriteRequest = { bytes: transferable, id, input };
      this.port.postMessage(request, [transferable]);
    });
  }

  save(captureId: string): Promise<LocalSavedMeeting> {
    return window.api.meetingCapture.save(captureId);
  }

  discard(captureId: string): Promise<void> {
    return window.api.meetingCapture.discard(captureId);
  }

  recover(): Promise<RecoverableMeetingCapture[]> {
    return window.api.meetingCapture.recover();
  }
}
