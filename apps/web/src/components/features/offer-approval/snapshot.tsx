import type { OfferApprovalSnapshot } from "@app/db-schema/offer-approval";
import { formatDate } from "@app/shared/utils";
export function OfferApprovalSnapshotView({ snapshot }: { snapshot: OfferApprovalSnapshot }) {
  const fields = [
    ["候选人", snapshot.candidateName],
    ["公司", snapshot.companyName],
    ["职位", snapshot.position],
    ["Base 月薪", `${snapshot.currency} ${snapshot.baseSalary.toLocaleString()}`],
    [
      "年度奖金",
      snapshot.bonus === null
        ? "未填写"
        : `${snapshot.currency} ${snapshot.bonus.toLocaleString()}`,
    ],
    ["期权 / 股票", snapshot.equity ?? "未填写"],
    ["预计入职日", snapshot.joiningDate ? formatDate(snapshot.joiningDate) : "未填写"],
    ["截止日期", snapshot.expiresAt ? formatDate(snapshot.expiresAt) : "未填写"],
    ["内部备注", snapshot.notes ?? "无"],
  ];
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
