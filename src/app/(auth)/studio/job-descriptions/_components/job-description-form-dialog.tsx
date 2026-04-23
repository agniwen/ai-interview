"use client";

import type { DepartmentRecord } from "@/lib/departments";
import type { InterviewerListRecord } from "@/lib/interviewers";
import { jobDescriptionFormSchema } from "@/lib/job-descriptions";
import type { JobDescriptionFormValues, JobDescriptionRecord } from "@/lib/job-descriptions";
import { useForm, useStore } from "@tanstack/react-form";
import { CheckIcon, ChevronsUpDownIcon, LoaderCircleIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SortableDragHandle, SortableItem, SortableList } from "@/components/ui/sortable-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSortableItemIds } from "@/hooks/use-sortable-item-ids";
import { cn } from "@/lib/utils";
import { hasFieldErrors, toFieldErrors } from "../../interviews/_components/interview-form";

function defaultValues(departmentId: string): JobDescriptionFormValues {
  return {
    departmentId,
    description: "",
    interviewerIds: [],
    name: "",
    presetQuestions: [],
    prompt: "",
  };
}

function toFormValues(record: JobDescriptionRecord): JobDescriptionFormValues {
  return {
    departmentId: record.departmentId,
    description: record.description ?? "",
    interviewerIds: [...record.interviewerIds],
    name: record.name,
    presetQuestions: [...(record.presetQuestions ?? [])],
    prompt: record.prompt,
  };
}

function InterviewerMultiSelect({
  interviewers,
  value,
  onChange,
  invalid,
}: {
  interviewers: InterviewerListRecord[];
  value: string[];
  onChange: (next: string[]) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(value);
  const selectedItems = interviewers.filter((item) => selectedSet.has(item.id));

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange(value.filter((item) => item !== id));
    } else {
      onChange([...value, id]);
    }
  }

  function remove(id: string) {
    onChange(value.filter((item) => item !== id));
  }

  return (
    <div className="space-y-2">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            aria-expanded={open}
            className={cn(
              "flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[invalid=true]:border-destructive data-[invalid=true]:ring-[3px] data-[invalid=true]:ring-destructive/20 dark:bg-input/30",
            )}
            data-invalid={invalid ? true : undefined}
            type="button"
          >
            <span className={selectedItems.length === 0 ? "text-muted-foreground" : ""}>
              {selectedItems.length === 0 ? "选择面试官…" : `已选 ${selectedItems.length} 位面试官`}
            </span>
            <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-72 p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Command>
            <CommandInput placeholder="搜索面试官…" />
            <CommandList>
              <CommandEmpty>没有匹配的面试官</CommandEmpty>
              <CommandGroup>
                {interviewers.map((item) => {
                  const isSelected = selectedSet.has(item.id);
                  return (
                    <CommandItem
                      key={item.id}
                      onSelect={() => toggle(item.id)}
                      value={`${item.name} ${item.departmentName ?? ""}`}
                    >
                      <CheckIcon
                        className={cn("size-4", isSelected ? "opacity-100" : "opacity-0")}
                      />
                      <div className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate">{item.name}</span>
                        <span className="truncate text-muted-foreground text-xs">
                          {item.departmentName ?? "未知部门"}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedItems.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <Badge className="gap-1 pr-0.5" key={item.id} variant="secondary">
              {item.name}
              <button
                aria-label={`移除 ${item.name}`}
                className="inline-flex size-4 items-center justify-center rounded-sm opacity-60 hover:bg-background/70 hover:opacity-100"
                onClick={() => remove(item.id)}
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function JobDescriptionFormDialog({
  open,
  onOpenChange,
  record,
  departments,
  interviewers,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: JobDescriptionRecord | null;
  departments: DepartmentRecord[];
  interviewers: InterviewerListRecord[];
  onSaved: () => void;
}) {
  const isEdit = record !== null;
  const fallbackDepartmentId = departments[0]?.id ?? "";
  const [activeTab, setActiveTab] = useState<"basic" | "questions">("basic");

  const form = useForm({
    defaultValues: record ? toFormValues(record) : defaultValues(fallbackDepartmentId),
    onSubmit: async ({ value }) => {
      const body = {
        departmentId: value.departmentId,
        description: value.description?.trim() || "",
        interviewerIds: value.interviewerIds,
        name: value.name.trim(),
        presetQuestions: (value.presetQuestions ?? []).map((q) => q.trim()).filter(Boolean),
        prompt: value.prompt.trim(),
      };

      const response = await fetch(
        isEdit ? `/api/studio/job-descriptions/${record.id}` : "/api/studio/job-descriptions",
        {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
          method: isEdit ? "PATCH" : "POST",
        },
      );
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(payload?.error ?? (isEdit ? "更新失败" : "创建失败"));
        return;
      }
      toast.success(isEdit ? "在招岗位已更新" : "在招岗位已创建");
      onSaved();
      onOpenChange(false);
    },
    onSubmitInvalid: ({ formApi }) => {
      const meta = formApi.store.state.fieldMeta as Record<string, { errors?: unknown[] }>;
      const hasPresetError = Object.entries(meta).some(
        ([key, value]) => key.startsWith("presetQuestions") && (value.errors?.length ?? 0) > 0,
      );
      const basicFields = ["name", "departmentId", "interviewerIds", "description", "prompt"];
      const hasBasicError = basicFields.some((key) => (meta[key]?.errors?.length ?? 0) > 0);
      if (hasPresetError && !hasBasicError) {
        setActiveTab("questions");
      } else if (hasBasicError) {
        setActiveTab("basic");
      }
    },
    validators: { onSubmit: jobDescriptionFormSchema },
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  useEffect(() => {
    if (open) {
      form.reset(record ? toFormValues(record) : defaultValues(fallbackDepartmentId));
      setActiveTab("basic");
    }
  }, [open, record, form, fallbackDepartmentId]);

  const missingRefs = departments.length === 0 || interviewers.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{isEdit ? "编辑在招岗位" : "新建在招岗位"}</DialogTitle>
            <DialogDescription>
              为在招岗位指定部门和面试官，prompt 在面试时会传给语音 agent。
            </DialogDescription>
          </DialogHeader>

          <Tabs
            className="mt-4"
            onValueChange={(value) => setActiveTab(value as "basic" | "questions")}
            value={activeTab}
          >
            <TabsList>
              <TabsTrigger value="basic">基本信息</TabsTrigger>
              <TabsTrigger value="questions">面试题</TabsTrigger>
            </TabsList>
            <TabsContent value="basic">
              <FieldGroup className="mt-4 gap-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <form.Field name="name">
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);
                      return (
                        <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                          <FieldLabel htmlFor={field.name}>
                            岗位名称 <span className="text-destructive">*</span>
                          </FieldLabel>
                          <FieldContent className="gap-2">
                            <Input
                              aria-invalid={!!errors?.length}
                              id={field.name}
                              onBlur={field.handleBlur}
                              onChange={(event) => field.handleChange(event.target.value)}
                              placeholder="如：高级前端工程师"
                              value={field.state.value}
                            />
                            <FieldError errors={errors} />
                          </FieldContent>
                        </Field>
                      );
                    }}
                  </form.Field>

                  <form.Field name="departmentId">
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);
                      return (
                        <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                          <FieldLabel htmlFor={field.name}>
                            所属部门 <span className="text-destructive">*</span>
                          </FieldLabel>
                          <FieldContent className="gap-2">
                            <Select
                              onValueChange={(value) => field.handleChange(value)}
                              value={field.state.value || undefined}
                            >
                              <SelectTrigger
                                aria-invalid={!!errors?.length}
                                className="w-full"
                                id={field.name}
                              >
                                <SelectValue placeholder="选择部门" />
                              </SelectTrigger>
                              <SelectContent>
                                {departments.map((dept) => (
                                  <SelectItem key={dept.id} value={dept.id}>
                                    {dept.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FieldError errors={errors} />
                          </FieldContent>
                        </Field>
                      );
                    }}
                  </form.Field>

                  <form.Field name="interviewerIds">
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);
                      return (
                        <Field
                          className="md:col-span-2"
                          data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                        >
                          <FieldLabel>
                            面试官 <span className="text-destructive">*</span>
                            <span className="ml-2 font-normal text-muted-foreground text-xs">
                              （可多选，面试时会随机挑选一位；不限定部门）
                            </span>
                          </FieldLabel>
                          <FieldContent className="gap-2">
                            <InterviewerMultiSelect
                              interviewers={interviewers}
                              invalid={!!errors?.length}
                              onChange={(next) => field.handleChange(next)}
                              value={field.state.value}
                            />
                            <FieldError errors={errors} />
                          </FieldContent>
                        </Field>
                      );
                    }}
                  </form.Field>
                </div>

                <form.Field name="description">
                  {(field) => {
                    const errors = toFieldErrors(field.state.meta.errors);
                    return (
                      <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                        <FieldLabel htmlFor={field.name}>描述（可选）</FieldLabel>
                        <FieldContent className="gap-2">
                          <Textarea
                            aria-invalid={!!errors?.length}
                            className="min-h-20"
                            id={field.name}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            placeholder="简要描述岗位职责、要求等"
                            value={field.state.value ?? ""}
                          />
                          <FieldError errors={errors} />
                        </FieldContent>
                      </Field>
                    );
                  }}
                </form.Field>

                <form.Field name="prompt">
                  {(field) => {
                    const errors = toFieldErrors(field.state.meta.errors);
                    return (
                      <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                        <FieldLabel htmlFor={field.name}>
                          岗位 Prompt <span className="text-destructive">*</span>
                        </FieldLabel>
                        <FieldContent className="gap-2">
                          <Textarea
                            aria-invalid={!!errors?.length}
                            className="min-h-44 font-mono text-sm"
                            id={field.name}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            placeholder="岗位关键职责、技术栈要求、期望的考察维度……"
                            value={field.state.value}
                          />
                          <FieldError errors={errors} />
                        </FieldContent>
                      </Field>
                    );
                  }}
                </form.Field>
              </FieldGroup>
            </TabsContent>
            <TabsContent value="questions">
              <form.Field mode="array" name="presetQuestions">
                {/* oxlint-disable-next-line no-explicit-any */}
                {(field: any) => (
                  // oxlint-disable-next-line no-use-before-define
                  <PresetQuestionsList field={field} form={form} resetKey={record?.id ?? "new"} />
                )}
              </form.Field>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={isSubmitting || missingRefs} type="submit">
              {isSubmitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              {isEdit ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PresetQuestionsList({
  field,
  form,
  resetKey,
}: {
  // oxlint-disable-next-line no-explicit-any
  field: any;
  // oxlint-disable-next-line no-explicit-any
  form: any;
  resetKey: string;
}) {
  const items = (field.state.value ?? []) as string[];
  const {
    ids,
    move: moveId,
    push: pushId,
    remove: removeId,
  } = useSortableItemIds(items.length, resetKey);

  return (
    <Field className="mt-4 gap-3">
      <FieldLabel>
        岗位预设面试题
        <span className="ml-2 font-normal text-muted-foreground text-xs">
          （面试时会先按顺序全部提问，然后才问简历生成的题目）
        </span>
      </FieldLabel>
      <FieldContent className="gap-2">
        {/* -mx-1/px-1 + py-1.5 leaves room for focus rings that would otherwise be clipped by overflow-y-auto. */}
        <div className="-mx-1 max-h-[50vh] overflow-y-auto px-1 py-1.5">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">暂无预设题，点击下方按钮添加。</p>
          ) : null}
          <SortableList
            ids={ids}
            onReorder={(from, to) => {
              field.moveValue(from, to);
              moveId(from, to);
            }}
          >
            {items.map((_item, index) => {
              const id = ids[index];
              if (!id) {
                return null;
              }
              return (
                <SortableItem id={id} key={id}>
                  {({ handleProps }) => (
                    <div className="flex items-start gap-2">
                      <SortableDragHandle
                        {...handleProps}
                        aria-label={`拖动以调整第 ${index + 1} 题的顺序`}
                        className="mt-1"
                      />
                      <span className="mt-2.5 w-6 shrink-0 text-right text-muted-foreground text-sm">
                        {index + 1}.
                      </span>
                      <div className="flex-1">
                        <form.Field name={`presetQuestions[${index}]`}>
                          {/* oxlint-disable-next-line no-explicit-any */}
                          {(subField: any) => {
                            const errors = toFieldErrors(subField.state.meta.errors);
                            return (
                              <>
                                <Textarea
                                  aria-invalid={!!errors?.length}
                                  className="min-h-16"
                                  onBlur={subField.handleBlur}
                                  onChange={(event) => subField.handleChange(event.target.value)}
                                  placeholder="请输入一道必问题目…"
                                  value={subField.state.value ?? ""}
                                />
                                <FieldError errors={errors} />
                              </>
                            );
                          }}
                        </form.Field>
                      </div>
                      <Button
                        aria-label={`删除第 ${index + 1} 题`}
                        className="mt-1"
                        onClick={() => {
                          field.removeValue(index);
                          removeId(index);
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <XIcon className="size-4" />
                      </Button>
                    </div>
                  )}
                </SortableItem>
              );
            })}
          </SortableList>
        </div>
        <Button
          className="self-start"
          onClick={() => {
            field.pushValue("");
            pushId();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <PlusIcon className="size-4" />
          添加题目
        </Button>
      </FieldContent>
    </Field>
  );
}
