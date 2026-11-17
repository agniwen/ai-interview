import { MAX_RESUME_FILE_SIZE_BYTES } from "@app/shared/bulk-resume-upload";
import {
  isExternalApplicationResume,
  externalApplicationResumeAccept,
  externalApplicationResumeLabel,
} from "@app/shared/resume-documents";
import { IconUpload } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { InterviewEntryShell } from "@/components/features/human-interview/interview-entry-shell";
import { formatJobDescriptionForDisplay } from "@/components/features/human-interview/job-description-display";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { FileUpload } from "@/components/ui/file-upload";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/client/api/client";
import { ApiError } from "@/lib/client/api/errors";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { rpc } from "@/lib/client/rpc";

const automatic = { id: "", jd: "", name: "智能匹配" };

interface ApplicationFile {
  id: string;
  file: File;
  error?: string;
}

const receiptSchema = z.array(z.object({ id: z.string(), name: z.string() }));
type Receipt = z.infer<typeof receiptSchema>[number];

function readReceipts(key: string): Receipt[] {
  try {
    return receiptSchema.parse(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return [];
  }
}

async function submitResume(token: string, jobId: string, item: ApplicationFile) {
  const { file, id } = item;
  if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
    return { ...item, error: "简历文件不能超过 20 MB。" };
  }
  if (!isExternalApplicationResume({ fileName: file.name, mediaType: file.type })) {
    return { ...item, error: `仅支持 ${externalApplicationResumeLabel}。` };
  }
  const body = new FormData();
  body.set("resume", file);
  body.set("jobDescriptionId", jobId);
  body.set("requestId", id);
  try {
    await apiFetch(`/api/public/external-applications/${encodeURIComponent(token)}/resumes`, {
      body,
      method: "POST",
    });
    return { ...item, accepted: true, error: undefined };
  } catch (error) {
    return {
      ...item,
      error: error instanceof Error ? error.message : "提交失败，请重试。",
      refreshJobs: error instanceof ApiError && error.status === 409,
    };
  }
}

export function ExternalApplicationPage({ token }: { token: string }) {
  // Each workspace has one stable external application token.
  const historyKey = `external-application-history:${token}`;
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [tab, setTab] = useState("outbox");
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Read browser storage after hydration.
    setReceipts(readReceipts(historyKey));
  }, [historyKey]);
  const [jobId, setJobId] = useState("");
  const [files, setFiles] = useState<ApplicationFile[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const preview = useQuery({
    queryFn: () =>
      rpcFetch(
        rpc.api.public["external-applications"][":token"].$get({ param: { token } }),
        "加载投递页面失败",
      ),
    queryKey: ["external-application", token],
    retry: false,
  });
  const upload = useMutation({
    mutationFn: async (items: ApplicationFile[]) => {
      const accepted: Receipt[] = [];
      for (const item of items) {
        const result = await submitResume(token, jobId, item);
        if ("accepted" in result && result.accepted) {
          accepted.push({ id: item.id, name: item.file.name });
          setFiles((current) => current.filter((entry) => entry.id !== item.id));
        } else {
          setFiles((current) => current.map((entry) => (entry.id === item.id ? result : entry)));
        }
        if ("refreshJobs" in result && result.refreshJobs) {
          await preview.refetch();
          break;
        }
      }
      return accepted;
    },
    onSuccess: (accepted, items) => {
      if (!accepted.length) {
        return;
      }
      const append = (previous: Receipt[]) => [
        ...new Map([...accepted, ...previous].map((receipt) => [receipt.id, receipt])).values(),
      ];
      try {
        localStorage.setItem(historyKey, JSON.stringify(append(readReceipts(historyKey))));
      } catch {
        toast.warning("浏览器无法保存投递历史。");
      }
      setReceipts(append);
      toast.success(`已投递 ${accepted.length} 份简历`);
      if (accepted.length === items.length && items.length === files.length) {
        setTab("sent");
      }
    },
  });
  if (preview.isPending) {
    return (
      <InterviewEntryShell hideMobileTheme>
        <Skeleton className="h-56 w-full max-w-5xl" />
      </InterviewEntryShell>
    );
  }
  if (preview.isError) {
    return (
      <InterviewEntryShell hideMobileTheme>
        <h1 className="text-2xl font-semibold">投递链接不可用</h1>
      </InterviewEntryShell>
    );
  }
  const jobs = [automatic, ...preview.data.jobs];
  const selected = jobs.find((job) => job.id === jobId);
  const jobDescription = selected?.jd.trim() ? (
    <MarkdownView
      className="text-sm leading-7 [&_p]:whitespace-pre-line"
      content={formatJobDescriptionForDisplay(selected.jd)}
    />
  ) : (
    <p className="text-sm text-muted-foreground">暂未提供岗位 JD。</p>
  );
  return (
    <InterviewEntryShell hideMobileTheme>
      <div className="grid w-full max-w-lg items-start gap-6 md:max-w-5xl md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-10 lg:gap-20">
        <section className="flex min-w-0 flex-col gap-5 md:sticky md:top-[clamp(3rem,10dvh,6rem)]">
          <header className="space-y-2">
            <p className="text-sm leading-5 text-muted-foreground">{preview.data.workspaceName}</p>
            <h1 className="text-3xl font-semibold sm:text-4xl">投递简历</h1>
          </header>
          <div className="space-y-2">
            <label htmlFor="application-position" className="text-sm font-medium">
              投递岗位
            </label>
            <Combobox
              disabled={upload.isPending}
              items={jobs}
              itemToStringLabel={(job) => job.name}
              isItemEqualToValue={(job, value) => job.id === value.id}
              value={selected ?? null}
              onValueChange={(job) => setJobId(job?.id ?? "")}
            >
              <ComboboxInput
                aria-describedby="application-position-hint"
                id="application-position"
                placeholder="搜索岗位"
              />
              <ComboboxContent>
                <ComboboxEmpty>没有匹配的岗位</ComboboxEmpty>
                <ComboboxList>
                  {(job: (typeof jobs)[number]) => (
                    <ComboboxItem key={job.id} value={job}>
                      {job.name}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <div className="flex min-h-8 items-center">
              {selected?.id ? (
                <>
                  <Drawer direction="bottom" key={selected.id}>
                    <DrawerTrigger asChild>
                      <Button
                        className="w-full md:hidden"
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        查看 JD
                      </Button>
                    </DrawerTrigger>
                    <DrawerContent className="max-h-[85dvh]">
                      <DrawerHeader className="mx-auto w-full max-w-3xl flex-row items-start justify-between gap-4 text-left">
                        <div className="min-w-0">
                          <DrawerTitle>岗位 JD</DrawerTitle>
                          <DrawerDescription>{selected.name}</DrawerDescription>
                        </div>
                        <DrawerClose asChild>
                          <Button size="sm" type="button" variant="ghost">
                            关闭
                          </Button>
                        </DrawerClose>
                      </DrawerHeader>
                      <ScrollArea className="mx-auto min-h-0 w-full max-w-3xl flex-1" scrollFade>
                        <div className="px-4 pt-2 pb-8">{jobDescription}</div>
                      </ScrollArea>
                    </DrawerContent>
                  </Drawer>
                  <p
                    className="hidden text-sm leading-5 text-muted-foreground md:block"
                    id="application-position-hint"
                  >
                    简历将投递到所选岗位。
                  </p>
                </>
              ) : (
                <p
                  className="text-sm leading-5 text-muted-foreground"
                  id="application-position-hint"
                >
                  系统会为每份简历匹配在招岗位。
                </p>
              )}
            </div>
          </div>
          <FileUpload
            accept={externalApplicationResumeAccept}
            acceptedFileTypes={[{ icon: IconUpload, label: externalApplicationResumeLabel }]}
            ariaLabel="选择或拖放简历"
            browseLabel="选择简历"
            description={`支持 ${externalApplicationResumeLabel}，单个文件不超过 20 MB。`}
            disabled={upload.isPending}
            onFilesSelected={(incoming) => {
              const entries = incoming.map((file) => ({ file, id: crypto.randomUUID() }));
              setFiles((previous) => [...previous, ...entries]);
              setTab("outbox");
              setResetKey((key) => key + 1);
              return false;
            }}
            resetKey={resetKey}
            showFileList={false}
            title="上传简历"
          />
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList variant="line">
              <TabsTab value="outbox">投递箱（{files.length}）</TabsTab>
              <TabsTab value="sent">已投递（{receipts.length}）</TabsTab>
            </TabsList>
            <TabsPanel value="outbox">
              <ScrollArea className="h-48" scrollFade>
                <ul className="space-y-1 text-sm" aria-live="polite">
                  {files.map((item) => (
                    <li key={item.id} className="flex min-h-9 items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate" title={item.file.name}>
                          {item.file.name}
                        </p>
                        {item.error ? <p className="text-destructive">{item.error}</p> : null}
                      </div>
                      {item.error && selected ? (
                        <Button
                          disabled={upload.isPending}
                          size="sm"
                          variant="outline"
                          onClick={() => upload.mutate([item])}
                        >
                          重试
                        </Button>
                      ) : null}
                      {
                        <Button
                          disabled={upload.isPending}
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setFiles((current) => current.filter((entry) => entry.id !== item.id))
                          }
                        >
                          移除
                        </Button>
                      }
                    </li>
                  ))}
                </ul>
                {files.length ? null : (
                  <p className="py-2 text-sm text-muted-foreground">暂无待投递简历</p>
                )}
              </ScrollArea>
            </TabsPanel>
            <TabsPanel value="sent">
              <ScrollArea className="h-48" scrollFade>
                <ul className="space-y-1 text-sm">
                  {receipts.map((receipt) => (
                    <li key={receipt.id} className="h-9 truncate py-2" title={receipt.name}>
                      {receipt.name}
                    </li>
                  ))}
                </ul>
                {receipts.length ? null : (
                  <p className="py-2 text-sm text-muted-foreground">暂无已投递简历</p>
                )}
              </ScrollArea>
            </TabsPanel>
          </Tabs>
          <Button
            disabled={!selected || !files.length || upload.isPending}
            onClick={() => upload.mutate(files)}
          >
            {upload.isPending ? "正在投递…" : "提交简历"}
          </Button>
        </section>
        {selected?.id ? (
          <section className="hidden min-w-0 flex-col gap-6 pb-4 md:flex">
            <h2 className="text-sm font-semibold leading-5">岗位 JD</h2>
            {jobDescription}
          </section>
        ) : null}
      </div>
    </InterviewEntryShell>
  );
}
