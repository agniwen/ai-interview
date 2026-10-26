import { Outlet, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "@/components/features/studio/page-header";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";

const QUESTION_BANK_TABS = {
  forms: {
    description: "表单题可按岗位复用；提交后随面试留档。",
    label: "表单题",
    to: "/w/$slug/studio/question-bank/forms",
  },
  "interview-questions": {
    description: "沟通题可全局或按岗位复用；候选人点击开始面试时绑定最新题目。",
    label: "沟通题",
    to: "/w/$slug/studio/question-bank/interview-questions",
  },
} as const;

const QUESTION_BANK_TAB_ORDER = ["forms", "interview-questions"] as const;

type QuestionBankTab = (typeof QUESTION_BANK_TAB_ORDER)[number];

function isQuestionBankTab(value: unknown): value is QuestionBankTab {
  return QUESTION_BANK_TAB_ORDER.some((tab) => tab === value);
}

/**
 * 「面试题配置」页：表单题与沟通题各是一个子路由，各自保留列表的 URL 参数，标签切换即切换子路由。
 * Question bank page: forms and interview questions are child routes that keep their own list
 * URL params; switching tabs navigates between them.
 */
export function QuestionBankLayout() {
  const { slug } = useParams({ from: "/w/$slug/studio/question-bank" });
  const navigate = useNavigate();
  const activeTab: QuestionBankTab = useRouterState({
    select: (state) =>
      state.location.pathname.endsWith("/interview-questions") ? "interview-questions" : "forms",
  });

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6">
      <PageHeader description={QUESTION_BANK_TABS[activeTab].description} title="面试题配置" />
      <Tabs
        onValueChange={(value) => {
          if (isQuestionBankTab(value) && value !== activeTab) {
            void navigate({ params: { slug }, to: QUESTION_BANK_TABS[value].to });
          }
        }}
        value={activeTab}
      >
        <TabsList>
          {QUESTION_BANK_TAB_ORDER.map((tab) => (
            <TabsTab key={tab} value={tab}>
              {QUESTION_BANK_TABS[tab].label}
            </TabsTab>
          ))}
        </TabsList>
      </Tabs>
      <Outlet />
    </div>
  );
}
