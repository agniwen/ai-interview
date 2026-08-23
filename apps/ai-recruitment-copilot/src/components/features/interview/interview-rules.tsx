import {
  IconAlertTriangle,
  IconMessage2,
  IconUserCheck,
  IconVideo,
  IconVolume2,
} from "@tabler/icons-react";
import { cn } from "@arc/shared/utils";
import { RuleItem } from "./interview-rule-item";

export function InterviewRules({
  className,
  recordingEnabled,
}: {
  className?: string;
  recordingEnabled: boolean;
}) {
  return (
    <ul className={cn("divide-y divide-border/60", className)}>
      <RuleItem
        description="建议佩戴耳机，并选择安静、网络稳定的环境。若暂时不便语音，您可以选择「静音开始」，以文字方式交流。"
        icon={IconVolume2}
        title="选择合适的环境"
      />
      <RuleItem
        description="请在面试官提问结束后作答。您可以围绕问题，结合真实项目与经历，按自己的节奏说明。"
        icon={IconMessage2}
        title="按自己的节奏作答"
      />
      <RuleItem
        description="如有暂时无法确认的问题，您可以如实说明。清晰、真实的表达更有助于双方相互了解。"
        icon={IconUserCheck}
        title="保持真实、清晰"
      />
      {recordingEnabled ? (
        <RuleItem
          description="本轮面试将进行录像。面试期间请保持摄像头开启，以保证记录完整；如有疑问，可先联系招聘负责人。"
          icon={IconVideo}
          title="关于面试录像"
        />
      ) : null}
      <RuleItem
        description="建议在面试期间保持本页面开启。如遇网络中断，请在 3 分钟内返回本页面，我们会尽力恢复之前的对话。"
        icon={IconAlertTriangle}
        title="遇到连接中断时"
      />
    </ul>
  );
}
