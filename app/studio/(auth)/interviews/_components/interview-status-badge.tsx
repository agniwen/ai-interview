import { Badge } from '@/components/ui/badge';
import { studioInterviewStatusMeta } from '@/lib/studio-interviews';

export function InterviewStatusBadge({ status }: { status: keyof typeof studioInterviewStatusMeta }) {
  const meta = studioInterviewStatusMeta[status];
  return <Badge variant={meta.tone}>{meta.label}</Badge>;
}
