import type { ResumeProfile } from "@/lib/shared/interview/types";

interface ResumeProfileViewProps {
  profile: ResumeProfile | null;
}

const PLACEHOLDER = "未发现信息";

function isPresent(value: string | null | undefined) {
  return Boolean(value && value.trim() && value.trim() !== PLACEHOLDER);
}

function FactRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value === null || value === "" ? "—" : value}</span>
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">—</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item} className="rounded-full border border-border/60 px-2.5 py-0.5 text-xs">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function ResumeProfileView({ profile }: ResumeProfileViewProps) {
  if (!profile) {
    return <p className="text-muted-foreground text-sm">暂无结构化简历，仅有候选人基础信息。</p>;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-2 md:grid-cols-2">
        <FactRow label="姓名" value={isPresent(profile.name) ? profile.name : null} />
        <FactRow label="性别" value={isPresent(profile.gender) ? profile.gender : null} />
        <FactRow label="年龄" value={profile.age} />
        <FactRow label="工作年限" value={profile.workYears} />
        <FactRow label="邮箱" value={profile.email} />
        <FactRow label="电话" value={profile.phone} />
      </section>

      <section>
        <h4 className="mb-2 font-medium text-sm">求职意向</h4>
        <ChipList items={profile.targetRoles} />
      </section>

      <section>
        <h4 className="mb-2 font-medium text-sm">毕业院校</h4>
        <ChipList items={profile.schools} />
      </section>

      <section>
        <h4 className="mb-2 font-medium text-sm">掌握技能</h4>
        <ChipList items={profile.skills} />
      </section>

      <section>
        <h4 className="mb-2 font-medium text-sm">个人优势</h4>
        {profile.personalStrengths.length === 0 ? (
          <p className="text-muted-foreground text-sm">—</p>
        ) : (
          <ul className="list-inside list-disc space-y-1 text-sm">
            {profile.personalStrengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-2 font-medium text-sm">工作经历</h4>
        {profile.workExperiences.length === 0 ? (
          <p className="text-muted-foreground text-sm">—</p>
        ) : (
          <ul className="space-y-3">
            {profile.workExperiences.map((exp, index) => (
              <li
                key={`${exp.company ?? "company"}-${index}`}
                className="rounded-md border border-border/60 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-sm">
                    {isPresent(exp.role) ? exp.role : "未发现岗位"}
                    {isPresent(exp.company) ? ` · ${exp.company}` : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {isPresent(exp.period) ? exp.period : ""}
                  </span>
                </div>
                {isPresent(exp.summary) ? (
                  <p className="mt-1 whitespace-pre-line text-muted-foreground text-sm">
                    {exp.summary}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-2 font-medium text-sm">项目经历</h4>
        {profile.projectExperiences.length === 0 ? (
          <p className="text-muted-foreground text-sm">—</p>
        ) : (
          <ul className="space-y-3">
            {profile.projectExperiences.map((proj, index) => (
              <li
                key={`${proj.name ?? "project"}-${index}`}
                className="rounded-md border border-border/60 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-sm">
                    {isPresent(proj.name) ? proj.name : "未命名项目"}
                    {isPresent(proj.role) ? ` · ${proj.role}` : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {isPresent(proj.period) ? proj.period : ""}
                  </span>
                </div>
                {isPresent(proj.summary) ? (
                  <p className="mt-1 whitespace-pre-line text-muted-foreground text-sm">
                    {proj.summary}
                  </p>
                ) : null}
                {proj.techStack.length > 0 ? (
                  <div className="mt-2">
                    <ChipList items={proj.techStack} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
