import type { SVGProps } from "react";
import { ResumeDocumentFileIcon } from "@/components/features/resume/resume-document-file-icon";

export function PdfFileIcon(props: SVGProps<SVGSVGElement>) {
  return <ResumeDocumentFileIcon kind="pdf" {...props} />;
}
