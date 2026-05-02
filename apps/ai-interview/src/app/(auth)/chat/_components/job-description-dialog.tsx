"use client";

import type { JobDescriptionConfig } from "@/lib/job-description-config";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useJobDescriptionOptionsQuery } from "../_lib/use-job-description-options";

type DialogMode = "select" | "custom";

interface JobDescriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: JobDescriptionConfig | null;
  onSave: (next: JobDescriptionConfig | null) => void;
  onClear: () => void;
}

function deriveInitialState(config: JobDescriptionConfig | null): {
  mode: DialogMode;
  selectedId: string;
  draft: string;
} {
  if (config?.mode === "select") {
    return { draft: "", mode: "select", selectedId: config.jobDescriptionId };
  }
  if (config?.mode === "custom") {
    return { draft: config.text, mode: "custom", selectedId: "" };
  }
  return { draft: "", mode: "select", selectedId: "" };
}

export function JobDescriptionDialog({
  open,
  onOpenChange,
  config,
  onSave,
  onClear,
}: JobDescriptionDialogProps) {
  const initial = deriveInitialState(config);
  const [mode, setMode] = useState<DialogMode>(initial.mode);
  const [selectedId, setSelectedId] = useState<string>(initial.selectedId);
  const [draft, setDraft] = useState<string>(initial.draft);

  // Re-seed the form whenever the dialog re-opens so it always reflects the
  // currently applied JD (rather than the previous editing session).
  useEffect(() => {
    if (open) {
      const next = deriveInitialState(config);
      setMode(next.mode);
      setSelectedId(next.selectedId);
      setDraft(next.draft);
    }
  }, [open, config]);

  const { data: options = [] } = useJobDescriptionOptionsQuery();
  const selectedPreview = options.find((item) => item.id === selectedId);

  const handleSave = () => {
    if (mode === "select") {
      const selected = options.find((item) => item.id === selectedId);
      if (selected) {
        onSave({
          departmentName: selected.departmentName,
          jobDescriptionId: selected.id,
          mode: "select",
          name: selected.name,
          prompt: selected.prompt,
        });
      } else {
        onSave(null);
      }
    } else {
      const text = draft.trim();
      onSave(text ? { mode: "custom", text } : null);
    }
    onOpenChange(false);
  };

  const handleClear = () => {
    onClear();
    setMode("select");
    setSelectedId("");
    setDraft("");
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>在招岗位信息设置</DialogTitle>
          <DialogDescription>
            选择后台已配置的在招岗位，或手动填写 JD 作为简历评估的上下文。若你在对话中明确给出
            JD，模型会优先使用对话中提供的版本。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3">
          <div className="space-y-0.5">
            <div className="font-medium text-sm">从在招岗位中选择</div>
            <div className="text-muted-foreground text-xs">关闭则手动填写自定义 JD</div>
          </div>
          <Switch
            checked={mode === "select"}
            onCheckedChange={(next) => setMode(next ? "select" : "custom")}
          />
        </div>

        {mode === "select" ? (
          <div className="space-y-2">
            <Label htmlFor="job-description-select">选择在招岗位</Label>
            <Select onValueChange={setSelectedId} value={selectedId || undefined}>
              <SelectTrigger className="h-13! w-full" id="job-description-select">
                <SelectValue
                  placeholder={options.length === 0 ? "暂无已配置的在招岗位" : "请选择在招岗位"}
                />
              </SelectTrigger>
              <SelectContent>
                {options.map((jd) => (
                  <SelectItem key={jd.id} value={jd.id}>
                    <div className="flex w-full flex-col items-start text-left">
                      <span>
                        {jd.departmentName ? `${jd.departmentName} / ` : ""}
                        {jd.name}
                      </span>
                      {jd.description ? (
                        <span className="line-clamp-1 text-muted-foreground text-xs">
                          {jd.description}
                        </span>
                      ) : null}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPreview ? (
              <div className="max-h-48 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-muted-foreground text-xs">
                <div className="mb-1 font-medium text-foreground">{selectedPreview.name}</div>
                <pre className="whitespace-pre-wrap font-sans">{selectedPreview.prompt}</pre>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                选中后会把岗位名称与 prompt 作为评估上下文传给 Agent。
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <label className="font-medium text-sm" htmlFor="job-description">
              自定义 JD 内容
            </label>
            <textarea
              autoComplete="off"
              className="mt-2 min-h-40 w-full rounded-xl border border-border/70 bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              id="job-description"
              name="jobDescription"
              onChange={(event) => setDraft(event.currentTarget.value)}
              placeholder="例如：前端开发岗位，要求 React/TypeScript 基础，有完整项目经历或相关工作/实习经验…"
              spellCheck={false}
              value={draft}
            />
          </div>
        )}

        <DialogFooter>
          <Button onClick={handleClear} type="button" variant="outline">
            清空
          </Button>
          <Button disabled={mode === "select" && !selectedId} onClick={handleSave} type="button">
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
