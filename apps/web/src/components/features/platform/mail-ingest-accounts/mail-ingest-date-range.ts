export interface MailIngestDateRange {
  receivedFrom?: string;
  receivedTo?: string;
}

/** 本地日期转为收信时间范围：起始取当天 00:00，截止取当天 23:59:59.999。 */
export function serializeDateRange(from: string | null, to: string | null): MailIngestDateRange {
  const out: MailIngestDateRange = {};
  let fromDate: Date | null = null;
  let toDate: Date | null = null;
  if (from) {
    const [y, m, d] = from.split("-").map(Number);
    fromDate = new Date(y, m - 1, d, 0, 0, 0, 0);
    out.receivedFrom = fromDate.toISOString();
  }
  if (to) {
    const [y, m, d] = to.split("-").map(Number);
    toDate = new Date(y, m - 1, d, 23, 59, 59, 999);
    out.receivedTo = toDate.toISOString();
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw new Error("起始日期不能晚于结束日期");
  }
  return out;
}
