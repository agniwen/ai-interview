import {
  ImageEntry,
  PdfEntry,
  TxtEntry,
  FileChipEntry,
} from "../../attachments/attachment-preview-dialog";

export interface InMessageAttachmentProps {
  type: "image" | "document" | "file";
  contentType?: string;
  src?: string;
  data?: string;
  /** Display label for `file` chips (filename or URI). */
  name?: string;
}

const renderAttachment = ({ type, contentType, src, data, name }: InMessageAttachmentProps) => {
  if (type === "image") {
    return <ImageEntry src={src ?? ""} />;
  }
  if (type === "file") {
    return (
      <FileChipEntry name={name ?? src ?? data ?? "file"} url={src} contentType={contentType} />
    );
  }
  if (contentType === "application/pdf") {
    return <PdfEntry data={data ?? ""} url={src} />;
  }
  return <TxtEntry data={data ?? ""} />;
};

/**
 * Renders an attachment preview inline in a message: image, PDF, plain text, or a
 * placeholder chip for media the browser cannot preview (video, gs://, s3://).
 */
export const InMessageAttachment = ({
  type,
  contentType,
  src,
  data,
  name,
}: InMessageAttachmentProps) => (
  <div className="h-full w-full overflow-hidden rounded-lg">
    {renderAttachment({ contentType, data, name, src, type })}
  </div>
);
