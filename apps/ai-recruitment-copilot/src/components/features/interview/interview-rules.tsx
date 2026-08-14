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
        description="建议佩戴耳机并在网络稳定的地方作答。若环境嘈杂，可选择「静音开始」，以文字方式与面试官沟通。"
        icon={IconVolume2}
        title="保持安静的环境"
      />
      <RuleItem
        description="等面试官提完问题再作答，答完等下一题。请围绕问题展开，结合具体项目与经历说明。"
        icon={IconMessage2}
        title="一次只答一题"
      />
      <RuleItem
        description="保持严肃与尊重；连续答非所问或跳过题目会影响评分，必要时面试官会结束面试。"
        icon={IconUserCheck}
        title="认真作答"
      />
      {recordingEnabled ? (
        <RuleItem
          description="面试将通过摄像头全程录制，开始后请保持摄像头开启，期间不能关闭。"
          icon={IconVideo}
          title="保持摄像头录制"
        />
      ) : null}
      <RuleItem
        description="尽量不要刷新页面或关闭标签页。如遇网络中断，请在 3 分钟内回到本页面，可继续之前的对话。"
        icon={IconAlertTriangle}
        title="保持稳定连接"
      />
    </ul>
  );
}
