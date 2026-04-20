/**
 * 种子数据脚本
 * 用法：pnpm db:seed
 *
 * 插入 / 更新 部门 → 面试官 → JD（按 FK 依赖顺序）。
 * 所有记录使用固定 ID + onConflictDoUpdate，重复执行是幂等的。
 */
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { relations } from "@/lib/db/relations";
import * as schema from "@/lib/db/schema";
import type { MinimaxVoiceId } from "@/lib/minimax-voices";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. 请确保 .env 已配置。");
}

const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle({ client, relations, schema });

// ---------------------------------------------------------------------------
// 数据定义
// ---------------------------------------------------------------------------

interface DepartmentSeed {
  id: string;
  name: string;
  description: string;
}

interface InterviewerSeed {
  id: string;
  departmentId: string;
  name: string;
  description: string;
  voice: MinimaxVoiceId;
  prompt: string;
}

interface JobDescriptionSeed {
  id: string;
  departmentId: string;
  interviewerIds: string[];
  name: string;
  description: string;
  prompt: string;
}

const departments: DepartmentSeed[] = [
  {
    description: "负责后端服务、前端应用与基础设施的研发工作。",
    id: "seed-dept-rnd",
    name: "研发部",
  },
  {
    description: "负责产品规划、交互设计与项目管理。",
    id: "seed-dept-product",
    name: "产品部",
  },
  {
    description: "负责人力资源、招聘与员工发展。",
    id: "seed-dept-hr",
    name: "人力资源部",
  },
];

const interviewers: InterviewerSeed[] = [
  {
    departmentId: "seed-dept-rnd",
    description: "擅长考察分布式系统、数据库、性能调优。",
    id: "seed-interviewer-backend",
    name: "张工 · 后端技术面试官",
    prompt: `你是一位资深后端技术面试官，有 10 年以上的服务端开发经验，熟悉分布式系统、数据库、缓存、消息队列等后端核心技术。
你的风格是：
- 从实际场景切入，考察候选人的系统设计能力
- 关注候选人对底层原理的理解深度
- 追问时耐心，引导候选人展开思考
- 对"背题"式回答保持警惕，会用追问验证真实水平`,
    voice: "voice_agent_Male_Phone_1",
  },
  {
    departmentId: "seed-dept-rnd",
    description: "擅长考察前端工程能力与架构设计。",
    id: "seed-interviewer-frontend",
    name: "李工 · 前端技术面试官",
    prompt: `你是一位资深前端技术面试官，精通 React、TypeScript、浏览器原理、性能优化和现代前端工程化。
你的风格是：
- 关注代码质量、可维护性与工程实践
- 通过具体业务场景考察候选人设计能力
- 对 UI 细节、用户体验保有敏感度
- 鼓励候选人讨论权衡与取舍，而非标准答案`,
    voice: "male-qn-jingying",
  },
  {
    departmentId: "seed-dept-product",
    description: "擅长考察需求洞察、产品思维与沟通表达。",
    id: "seed-interviewer-product",
    name: "王 PM · 产品面试官",
    prompt: `你是一位资深产品经理面试官，有 8 年以上的 B 端和 C 端产品设计经验。
你的风格是：
- 从用户场景切入，考察候选人的需求洞察能力
- 关注数据驱动决策的习惯
- 注重沟通表达的结构化与清晰度
- 会通过假设场景（case study）考察产品思维`,
    voice: "female-yujie",
  },
  {
    departmentId: "seed-dept-hr",
    description: "擅长考察文化匹配度、职业动机、软技能。",
    id: "seed-interviewer-hr",
    name: "陈 HR · HR 面试官",
    prompt: `你是一位资深 HR 面试官，负责终面和文化匹配评估。
你的风格是：
- 友好专业，让候选人放松下来
- 关注候选人的长期职业规划和价值观
- 通过过往经历验证简历真实性
- 探讨团队协作、冲突处理等软技能场景`,
    voice: "voice_agent_Female_Phone_1",
  },
];

const jobDescriptions: JobDescriptionSeed[] = [
  {
    departmentId: "seed-dept-rnd",
    description: "研发部高级后端工程师岗位，要求 5 年以上 Java/Go 开发经验。",
    id: "seed-jd-senior-backend",
    // 多位技术面试官：面试时随机挑一位
    interviewerIds: ["seed-interviewer-backend", "seed-interviewer-frontend"],
    name: "高级后端工程师",
    prompt: `岗位：高级后端工程师
职责：
- 负责核心业务系统的架构设计与开发
- 主导技术难点攻关，优化系统性能与稳定性
- 指导初中级工程师，参与技术评审

要求：
- 5 年以上服务端开发经验，精通 Java 或 Go
- 熟悉 MySQL / PostgreSQL / Redis / Kafka 等常用组件
- 具备分布式系统设计经验，了解 CAP / 一致性 / 高可用
- 代码质量意识强，注重可维护性

考察重点：
1. 系统设计：设计一个高并发的订单系统
2. 性能调优：慢 SQL 排查与优化思路
3. 分布式：分布式锁、幂等、消息可靠投递
4. 工程能力：代码重构、异常处理、测试策略`,
  },
  {
    departmentId: "seed-dept-rnd",
    description: "研发部高级前端工程师岗位，要求 4 年以上 React 经验。",
    id: "seed-jd-senior-frontend",
    interviewerIds: ["seed-interviewer-frontend"],
    name: "高级前端工程师",
    prompt: `岗位：高级前端工程师
职责：
- 负责核心 Web 产品的前端架构与开发
- 推动前端工程化与研发效率提升
- 设计并实现复杂交互与数据可视化

要求：
- 4 年以上 Web 前端开发经验，精通 React + TypeScript
- 熟悉浏览器原理、性能优化、Web 标准
- 有大型项目架构经验，了解 SSR / RSC / 构建工具
- 对用户体验敏感，重视代码可读性

考察重点：
1. React 深度：Hooks、RSC、并发模式、性能优化
2. 工程化：Monorepo、构建工具、CI/CD
3. TypeScript：泛型、类型体操、类型安全
4. 浏览器：渲染流程、事件机制、内存管理`,
  },
  {
    departmentId: "seed-dept-product",
    description: "产品部 B 端产品经理岗位，负责企业服务类产品。",
    id: "seed-jd-b2b-pm",
    interviewerIds: ["seed-interviewer-product"],
    name: "B 端产品经理",
    prompt: `岗位：B 端产品经理
职责：
- 负责企业服务类产品的规划与迭代
- 深入业务调研，挖掘客户核心需求
- 协同研发、设计、运营推动产品落地

要求：
- 3 年以上 B 端产品经理经验
- 具备良好的业务理解与逻辑思维能力
- 熟练使用数据分析工具（SQL、BI 等）
- 优秀的跨团队沟通与推动能力

考察重点：
1. 需求洞察：从客户反馈中提炼产品机会
2. 产品设计：复杂业务流的梳理与可视化
3. 数据驱动：指标设计与结果评估
4. 项目推进：跨部门协作中的难点处理`,
  },
  {
    departmentId: "seed-dept-rnd",
    description: "研发部 HR 终面，评估文化匹配与职业规划（跨部门指派面试官演示）。",
    id: "seed-jd-rnd-hr-round",
    interviewerIds: ["seed-interviewer-hr"],
    name: "研发岗 · HR 终面",
    prompt: `岗位：研发岗 HR 终面
场景：
- 面向通过技术面的研发候选人
- 目标是评估文化匹配度、职业稳定性、长期规划

考察重点：
1. 离职原因与下一步动机
2. 团队协作风格，与冲突处理
3. 长期职业规划（3–5 年）
4. 薪资期望与 base 匹配度
5. 对公司业务与文化的了解`,
  },
];

// ---------------------------------------------------------------------------
// Upsert 辅助
// ---------------------------------------------------------------------------

async function seedDepartments(): Promise<void> {
  const now = new Date();
  for (const item of departments) {
    await db
      .insert(schema.department)
      .values({
        createdAt: now,
        createdBy: null,
        description: item.description,
        id: item.id,
        name: item.name,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        set: {
          description: sql`excluded.description`,
          name: sql`excluded.name`,
          updatedAt: now,
        },
        target: schema.department.id,
      });
    console.log(`  ✓ department ${item.id} (${item.name})`);
  }
}

async function seedInterviewers(): Promise<void> {
  const now = new Date();
  for (const item of interviewers) {
    await db
      .insert(schema.interviewer)
      .values({
        createdAt: now,
        createdBy: null,
        departmentId: item.departmentId,
        description: item.description,
        id: item.id,
        name: item.name,
        prompt: item.prompt,
        updatedAt: now,
        voice: item.voice,
      })
      .onConflictDoUpdate({
        set: {
          departmentId: sql`excluded.department_id`,
          description: sql`excluded.description`,
          name: sql`excluded.name`,
          prompt: sql`excluded.prompt`,
          updatedAt: now,
          voice: sql`excluded.voice`,
        },
        target: schema.interviewer.id,
      });
    console.log(`  ✓ interviewer ${item.id} (${item.name})`);
  }
}

async function seedJobDescriptions(): Promise<void> {
  const now = new Date();
  for (const item of jobDescriptions) {
    await db.transaction(async (tx) => {
      await tx
        .insert(schema.jobDescription)
        .values({
          createdAt: now,
          createdBy: null,
          departmentId: item.departmentId,
          description: item.description,
          id: item.id,
          name: item.name,
          prompt: item.prompt,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          set: {
            departmentId: sql`excluded.department_id`,
            description: sql`excluded.description`,
            name: sql`excluded.name`,
            prompt: sql`excluded.prompt`,
            updatedAt: now,
          },
          target: schema.jobDescription.id,
        });

      // 重建 JD ↔ 面试官 关联（幂等）
      await tx
        .delete(schema.jobDescriptionInterviewer)
        .where(eq(schema.jobDescriptionInterviewer.jobDescriptionId, item.id));
      if (item.interviewerIds.length > 0) {
        await tx.insert(schema.jobDescriptionInterviewer).values(
          item.interviewerIds.map((interviewerId) => ({
            createdAt: now,
            interviewerId,
            jobDescriptionId: item.id,
          })),
        );
      }
    });
    console.log(
      `  ✓ jobDescription ${item.id} (${item.name}) · 面试官 ${item.interviewerIds.length} 位`,
    );
  }
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("🌱 开始注入种子数据…\n");

  console.log("部门：");
  await seedDepartments();

  console.log("\n面试官：");
  await seedInterviewers();

  console.log("\nJD：");
  await seedJobDescriptions();

  console.log(
    `\n✅ 种子数据注入完成：${departments.length} 个部门 / ${interviewers.length} 位面试官 / ${jobDescriptions.length} 个 JD`,
  );
}

try {
  await main();
} catch (error) {
  console.error("❌ 种子数据注入失败：", error);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
