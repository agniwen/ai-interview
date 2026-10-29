import type { ReceivedMessage } from "@livekit/components-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { interviewConnectionState, interviewConnectionText } from "./interview-connection-status";

export function useInterviewConnectionNotifications(messages: ReceivedMessage[]) {
  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const message of messages) {
      const state = interviewConnectionState(message);
      if (!state || seen.current.has(message.id)) {
        continue;
      }
      seen.current.add(message.id);
      const options = { id: "interview-provider-connection" };
      if (state === "reconnected") {
        toast.success(interviewConnectionText(state), { ...options, duration: 6000 });
      } else {
        toast.loading(interviewConnectionText(state), options);
      }
    }
  }, [messages]);
  useEffect(
    () => () => {
      toast.dismiss("interview-provider-connection");
    },
    [],
  );
}
