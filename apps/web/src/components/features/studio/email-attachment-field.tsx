import { IconPaperclip, IconX } from "@tabler/icons-react";
import type { ChangeEvent } from "react";
import { toast } from "sonner";
import {
  EMAIL_ATTACHMENT_ACCEPT,
  EMAIL_ATTACHMENT_FORMAT_LABEL,
  EMAIL_ATTACHMENT_MAX_FILES,
  validateEmailAttachments,
} from "@app/shared/email-attachments";
import { formatBytes } from "@app/shared/utils";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

function fileIdentity(file: File) {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000${file.type}`;
}

export function EmailAttachmentField({
  disabled,
  files,
  id,
  onFilesChange,
}: {
  disabled?: boolean;
  files: readonly File[];
  id: string;
  onFilesChange: (files: File[]) => void;
}) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    const filesByIdentity = new Map(files.map((file) => [fileIdentity(file), file]));
    for (const file of selectedFiles) {
      const identity = fileIdentity(file);
      if (!filesByIdentity.has(identity)) {
        filesByIdentity.set(identity, file);
      }
    }
    const nextFiles = [...filesByIdentity.values()];
    const error = validateEmailAttachments(nextFiles);
    if (error) {
      toast.error(error);
      return;
    }
    onFilesChange(nextFiles);
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>附件（可选）</FieldLabel>
      <Input
        accept={EMAIL_ATTACHMENT_ACCEPT}
        disabled={disabled}
        id={id}
        multiple
        onChange={handleChange}
        type="file"
      />
      <FieldDescription>
        支持 {EMAIL_ATTACHMENT_FORMAT_LABEL}，最多 {EMAIL_ATTACHMENT_MAX_FILES}
        个；单个不超过 10 MB，总计不超过 20 MB。再次选择会追加到当前附件。
      </FieldDescription>
      {files.length > 0 ? (
        <AttachmentGroup aria-label="已选择的附件" className="flex-col overflow-x-visible py-0">
          {files.map((file, index) => (
            <Attachment className="w-full flex-nowrap" key={fileIdentity(file)} size="sm">
              <AttachmentMedia>
                <IconPaperclip />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{file.name}</AttachmentTitle>
                <AttachmentDescription>{formatBytes(file.size)}</AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction
                  aria-label={`移除附件 ${file.name}`}
                  onClick={() =>
                    onFilesChange(files.filter((_attachment, fileIndex) => index !== fileIndex))
                  }
                  type="button"
                >
                  <IconX />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          ))}
        </AttachmentGroup>
      ) : null}
    </Field>
  );
}
