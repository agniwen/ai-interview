/* oxlint-disable jsdoc/check-tag-names -- `@jsxImportSource` is a TS compiler directive */
/** @jsxImportSource chat */
// 中文：JD 选择列表卡片；每行一个 "选择" 按钮，点击触发 activate-jd 动作
// English: JD picker card; each row has a "选择" button firing the activate-jd action
import { Actions, Button, Card, CardText, Divider, Section } from "chat";

export interface JdListCardRecord {
  id: string;
  name: string;
  departmentName: string | null;
  description: string | null;
  prompt: string;
}

export interface JdListCardProps {
  records: JdListCardRecord[];
  truncated: boolean;
}

export function JdListCard({ records, truncated }: JdListCardProps) {
  if (records.length === 0) {
    return (
      <Card title="📋 选择 JD">
        <Section>
          <CardText>你的部门下还没有 JD，请先在 Studio 创建一个。</CardText>
        </Section>
      </Card>
    );
  }

  return (
    <Card title="📋 选择 JD">
      <Section>
        <CardText>从下方列表选择一个 JD 激活；激活后丢入的简历将与此 JD 匹配。</CardText>
      </Section>
      <Divider />
      {records.map((record, idx) => (
        <Section key={record.id}>
          <CardText>
            {`**${record.departmentName ? `${record.departmentName} / ` : ""}${record.name}**`}
            {record.description ? `\n${record.description}` : ""}
          </CardText>
          {Actions([
            Button({ id: "activate-jd", label: "选择", style: "primary", value: record.id }),
          ])}
          {idx < records.length - 1 ? <Divider /> : null}
        </Section>
      ))}
      {truncated ? (
        <Section>
          <CardText>仅显示前 10 条；如需查看全部请前往 Studio。</CardText>
        </Section>
      ) : null}
    </Card>
  );
}
