"use client";

import { Upload01Icon } from "@hugeicons/core-free-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircleIcon, FileTextIcon, LoaderCircleIcon } from "@/components/icons/hugeicons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUpload } from "@/components/ui/file-upload";
import {
  fetchPublicReferralPreview,
  uploadPublicReferralResume,
} from "@/lib/client/api/endpoints/referrals";
import { MAX_RESUME_FILE_SIZE_BYTES } from "@arc/shared/bulk-resume-upload";
import {
  isSupportedResumeDocumentInput,
  supportedResumeDocumentAccept,
  supportedResumeDocumentLabel,
} from "@arc/shared/resume-documents";

function validateReferralResume(file: File): string | null {
  if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
    return "简历文件不能超过 20 MB。";
  }
  if (!isSupportedResumeDocumentInput({ fileName: file.name, mediaType: file.type })) {
    return `仅支持上传 ${supportedResumeDocumentLabel} 简历。`;
  }
  return null;
}

function ReferralPage() {
  const { token } = useParams({ from: "/referrals/$token" });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedFileName, setSubmittedFileName] = useState<string | null>(null);
  const [uploadResetKey, setUploadResetKey] = useState(0);
  const previewQuery = useQuery({
    queryFn: () => fetchPublicReferralPreview(token),
    queryKey: ["public-referral", token],
    retry: false,
  });
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadPublicReferralResume(token, file),
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "简历提交失败，请稍后重试。");
      setUploadResetKey((key) => key + 1);
    },
    onSuccess: (_result, file) => {
      setErrorMessage(null);
      setSubmittedFileName(file.name);
      toast.success("简历已提交");
    },
  });

  const preview = previewQuery.data;
  const busy = previewQuery.isLoading || uploadMutation.isPending;
  const unavailable = previewQuery.isError;

  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-background px-4 py-10"
      id="main-content"
    >
      <div className="w-full max-w-xl">
        <Card className="rounded-md">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">岗位内推</Badge>
              {preview?.jobDescriptionCode ? (
                <Badge variant="outline">{preview.jobDescriptionCode}</Badge>
              ) : null}
            </div>
            <CardTitle className="text-2xl">
              {preview?.jobDescriptionName ?? "简历内推"}
            </CardTitle>
            <CardDescription>
              {preview
                ? `${preview.companyName}${preview.referrerName ? ` · 内推人：${preview.referrerName}` : ""}`
                : unavailable
                  ? "内推链接不可用"
                  : "正在加载内推信息"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {unavailable ? (
              <Alert variant="destructive">
                <FileTextIcon />
                <AlertTitle>内推链接不可用</AlertTitle>
                <AlertDescription>请联系分享链接的人重新发送。</AlertDescription>
              </Alert>
            ) : null}

            {submittedFileName ? (
              <Alert>
                <CheckCircleIcon />
                <AlertTitle>简历已提交</AlertTitle>
                <AlertDescription>{submittedFileName} 已进入简历广场。</AlertDescription>
              </Alert>
            ) : (
              <FileUpload
                accept={supportedResumeDocumentAccept}
                acceptedFileTypes={[{ icon: Upload01Icon, label: supportedResumeDocumentLabel }]}
                ariaLabel="上传内推简历"
                browseLabel="选择简历"
                description={`支持 ${supportedResumeDocumentLabel}，单个文件不超过 20 MB。`}
                disabled={busy || unavailable}
                draggingLabel="松开上传简历"
                maxFiles={1}
                multiple={false}
                onFilesAccepted={(files) => {
                  const file = files[0];
                  if (!file) {
                    return;
                  }
                  setErrorMessage(null);
                  uploadMutation.mutate(file);
                }}
                onFilesSelected={(files) => {
                  const file = files[0];
                  if (!file) {
                    return false;
                  }
                  const message = validateReferralResume(file);
                  setErrorMessage(message);
                  return message === null;
                }}
                rejectionLabel={`仅支持上传 ${supportedResumeDocumentLabel} 文件`}
                resetKey={uploadResetKey}
                showFileList={false}
                title={uploadMutation.isPending ? "正在提交简历" : "上传简历"}
              />
            )}

            {uploadMutation.isPending ? (
              <p className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                <LoaderCircleIcon className="size-4 animate-spin" />
                正在提交
              </p>
            ) : null}

            {errorMessage ? (
              <Alert variant="destructive">
                <FileTextIcon />
                <AlertTitle>提交失败</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            {submittedFileName ? (
              <Button
                onClick={() => {
                  setSubmittedFileName(null);
                  setUploadResetKey((key) => key + 1);
                }}
                type="button"
                variant="outline"
              >
                继续上传
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export const Route = createFileRoute("/referrals/$token")({
  component: ReferralPage,
  head: () => ({
    meta: [{ title: "简历内推" }],
  }),
});
