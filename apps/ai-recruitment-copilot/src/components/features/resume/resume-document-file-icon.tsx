import type { ReactNode, SVGProps } from "react";
import type { ResumeDocumentKind } from "@arc/shared/resume-documents";

export interface ResumeDocumentFileIconProps extends SVGProps<SVGSVGElement> {
  kind: ResumeDocumentKind;
  title?: string;
}

function DocumentIconFrame({
  children,
  title,
  viewBox,
  ...props
}: SVGProps<SVGSVGElement> & {
  children: ReactNode;
  title?: string;
  viewBox: string;
}) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

function PdfDocumentIcon(props: Omit<ResumeDocumentFileIconProps, "kind">) {
  return (
    <DocumentIconFrame viewBox="0 0 56 64" {...props}>
      <g>
        <path
          d="M5.1,0C2.3,0,0,2.3,0,5.1v53.8C0,61.7,2.3,64,5.1,64h45.8c2.8,0,5.1-2.3,5.1-5.1V20.3L37.1,0H5.1z"
          fill="#D93A2F"
        />
        <path d="M56,20.4v1H43.2c0,0-6.3-1.3-6.1-6.7c0,0,0.2,5.7,6,5.7H56z" fill="#B42B24" />
        <path d="M37.1,0v14.6c0,1.7,1.1,5.8,6.1,5.8H56L37.1,0z" fill="#FFFFFF" opacity="0.5" />
      </g>
      <path
        d="M14.9,49h-3.3v4.1c0,0.4-0.3,0.7-0.8,0.7c-0.4,0-0.7-0.3-0.7-0.7V42.9c0-0.6,0.5-1.1,1.1-1.1h3.7c2.4,0,3.8,1.7,3.8,3.6C18.7,47.4,17.3,49,14.9,49z M14.8,43.1h-3.2v4.6h3.2c1.4,0,2.4-0.9,2.4-2.3C17.2,44,16.2,43.1,14.8,43.1z M25.2,53.8h-3c-0.6,0-1.1-0.5-1.1-1.1v-9.8c0-0.6,0.5-1.1,1.1-1.1h3c3.7,0,6.2,2.6,6.2,6C31.4,51.2,29,53.8,25.2,53.8z M25.2,43.1h-2.6v9.3h2.6c2.9,0,4.6-2.1,4.6-4.7C29.9,45.2,28.2,43.1,25.2,43.1z M41.5,43.1h-5.8V47h5.7c0.4,0,0.6,0.3,0.6,0.7s-0.3,0.6-0.6,0.6h-5.7v4.8c0,0.4-0.3,0.7-0.8,0.7c-0.4,0-0.7-0.3-0.7-0.7V42.9c0-0.6,0.5-1.1,1.1-1.1h6.2c0.4,0,0.6,0.3,0.6,0.7C42.2,42.8,41.9,43.1,41.5,43.1z"
        fill="#FFFFFF"
      />
    </DocumentIconFrame>
  );
}

function DocxDocumentIcon(props: Omit<ResumeDocumentFileIconProps, "kind">) {
  return (
    <DocumentIconFrame viewBox="-4 0 64 64" {...props}>
      <g fillRule="evenodd">
        <path
          d="m5.11 0a5.07 5.07 0 0 0 -5.11 5v53.88a5.07 5.07 0 0 0 5.11 5.12h45.78a5.07 5.07 0 0 0 5.11-5.12v-38.6l-18.94-20.28z"
          fill="#107cad"
        />
        <path d="m56 20.35v1h-12.82s-6.31-1.26-6.13-6.71c0 0 .21 5.71 6 5.71z" fill="#084968" />
        <path d="m37.07 0v14.56a5.78 5.78 0 0 0 6.11 5.79h12.82z" fill="#90d0fe" opacity=".5" />
      </g>
      <path
        d="m14.24 53.86h-3a1.08 1.08 0 0 1 -1.08-1.08v-9.85a1.08 1.08 0 0 1 1.08-1.08h3a6 6 0 1 1 0 12zm0-10.67h-2.61v9.34h2.61a4.41 4.41 0 0 0 4.61-4.66 4.38 4.38 0 0 0 -4.61-4.68zm14.42 10.89a5.86 5.86 0 0 1 -6-6.21 6 6 0 1 1 11.92 0 5.87 5.87 0 0 1 -5.92 6.21zm0-11.09c-2.7 0-4.41 2.07-4.41 4.88s1.71 4.88 4.41 4.88 4.41-2.09 4.41-4.88-1.72-4.87-4.41-4.87zm18.45.38a.75.75 0 0 1 .2.52.71.71 0 0 1 -.7.72.64.64 0 0 1 -.51-.24 4.06 4.06 0 0 0 -3-1.38 4.61 4.61 0 0 0 -4.63 4.88 4.63 4.63 0 0 0 4.63 4.88 4 4 0 0 0 3-1.37.7.7 0 0 1 .51-.24.72.72 0 0 1 .7.74.78.78 0 0 1 -.2.51 5.33 5.33 0 0 1 -4 1.69 6.22 6.22 0 0 1 0-12.43 5.26 5.26 0 0 1 4 1.72z"
        fill="#ffffff"
      />
    </DocumentIconFrame>
  );
}

function XlsxDocumentIcon(props: Omit<ResumeDocumentFileIconProps, "kind">) {
  return (
    <DocumentIconFrame viewBox="-4 0 64 64" {...props}>
      <path
        clipRule="evenodd"
        d="M5.112.006c-2.802 0-5.073 2.273-5.073 5.074v53.841c0 2.803 2.271 5.074 5.073 5.074h45.774c2.801 0 5.074-2.271 5.074-5.074v-38.605l-18.902-20.31h-31.946z"
        fill="#45B058"
        fillRule="evenodd"
      />
      <path
        d="M19.429 53.938c-.216 0-.415-.09-.54-.27l-3.728-4.97-3.745 4.97c-.126.18-.324.27-.54.27-.396 0-.72-.306-.72-.72 0-.144.035-.306.144-.432l3.89-5.131-3.619-4.826c-.09-.126-.145-.27-.145-.414 0-.342.288-.72.721-.72.216 0 .432.108.576.288l3.438 4.628 3.438-4.646c.127-.18.324-.27.541-.27.378 0 .738.306.738.72 0 .144-.036.288-.127.414l-3.619 4.808 3.891 5.149c.09.126.125.27.125.414 0 .396-.324.738-.719.738zm9.989-.126h-5.455c-.595 0-1.081-.486-1.081-1.08v-10.317c0-.396.324-.72.774-.72.396 0 .721.324.721.72v10.065h5.041c.359 0 .648.288.648.648 0 .396-.289.684-.648.684zm6.982.216c-1.782 0-3.188-.594-4.213-1.495-.162-.144-.234-.342-.234-.54 0-.36.27-.756.702-.756.144 0 .306.036.433.144.828.738 1.98 1.314 3.367 1.314 2.143 0 2.826-1.152 2.826-2.071 0-3.097-7.111-1.386-7.111-5.672 0-1.98 1.764-3.331 4.123-3.331 1.548 0 2.881.468 3.853 1.278.162.144.253.342.253.54 0 .36-.307.72-.703.72-.145 0-.307-.054-.432-.162-.883-.72-1.98-1.044-3.079-1.044-1.44 0-2.467.774-2.467 1.909 0 2.701 7.112 1.152 7.112 5.636 0 1.748-1.188 3.53-4.43 3.53z"
        fill="#ffffff"
      />
      <path
        clipRule="evenodd"
        d="M55.953 20.352v1h-12.801s-6.312-1.26-6.127-6.707c0 0 .207 5.707 6.002 5.707h12.926z"
        fill="#349C42"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M37.049 0v14.561c0 1.656 1.104 5.791 6.104 5.791h12.801l-18.905-20.352z"
        fill="#ffffff"
        fillRule="evenodd"
        opacity=".5"
      />
    </DocumentIconFrame>
  );
}

function ImageDocumentIcon(props: Omit<ResumeDocumentFileIconProps, "kind">) {
  return (
    <DocumentIconFrame viewBox="-4 0 64 64" {...props}>
      <g clipRule="evenodd" fillRule="evenodd">
        <path
          d="M5.125.042c-2.801 0-5.072 2.273-5.072 5.074v53.841c0 2.803 2.271 5.073 5.072 5.073h45.775c2.801 0 5.074-2.271 5.074-5.073v-38.604l-18.904-20.311h-31.945z"
          fill="#49C9A7"
        />
        <path
          d="M55.977 20.352v1h-12.799s-6.312-1.26-6.129-6.707c0 0 .208 5.707 6.004 5.707h12.924z"
          fill="#37BB91"
        />
        <path
          d="M37.074 0v14.561c0 1.656 1.104 5.791 6.104 5.791h12.799l-18.903-20.352z"
          fill="#ffffff"
          opacity=".5"
        />
      </g>
      <path
        clipRule="evenodd"
        d="M10.119 53.739v-20.904h20.906v20.904h-20.906zm18.799-18.843h-16.691v12.6h16.691v-12.6zm-9.583 8.384l3.909-5.256 1.207 2.123 1.395-.434.984 5.631h-13.082l3.496-3.32 2.091 1.256zm-3.856-3.64c-.91 0-1.649-.688-1.649-1.538 0-.849.739-1.538 1.649-1.538.912 0 1.65.689 1.65 1.538 0 .85-.738 1.538-1.65 1.538z"
        fill="#ffffff"
        fillRule="evenodd"
      />
    </DocumentIconFrame>
  );
}

function PptxDocumentIcon(props: Omit<ResumeDocumentFileIconProps, "kind">) {
  return (
    <DocumentIconFrame viewBox="-4 0 64 64" {...props}>
      <path
        clipRule="evenodd"
        d="M5.112-.004c-2.802 0-5.073 2.273-5.073 5.074v53.841c0 2.803 2.271 5.074 5.073 5.074h45.774c2.801 0 5.074-2.271 5.074-5.074v-38.605l-18.902-20.31h-31.946z"
        fill="#E34221"
        fillRule="evenodd"
      />
      <g clipRule="evenodd" fillRule="evenodd">
        <path
          d="M55.977 20.352v1h-12.799s-6.312-1.26-6.129-6.707c0 0 .208 5.707 6.004 5.707h12.924z"
          fill="#DC3119"
        />
        <path
          d="M37.074 0v14.561c0 1.656 1.104 5.791 6.104 5.791h12.799l-18.903-20.352z"
          fill="#ffffff"
          opacity=".5"
        />
      </g>
      <path
        d="M14.964 49.011h-3.331v4.141c0 .414-.324.738-.756.738-.414 0-.738-.324-.738-.738v-10.298c0-.594.486-1.081 1.08-1.081h3.745c2.413 0 3.763 1.657 3.763 3.619 0 1.963-1.387 3.619-3.763 3.619zm-.181-5.906h-3.15v4.573h3.15c1.423 0 2.395-.936 2.395-2.287 0-1.349-.972-2.286-2.395-2.286zm11.197 5.906h-3.332v4.141c0 .414-.324.738-.756.738-.414 0-.738-.324-.738-.738v-10.298c0-.594.486-1.081 1.08-1.081h3.746c2.412 0 3.763 1.657 3.763 3.619 0 1.963-1.387 3.619-3.763 3.619zm-.18-5.906h-3.151v4.573h3.151c1.423 0 2.395-.936 2.395-2.287-.001-1.349-.972-2.286-2.395-2.286zm14.112 0h-3.277v10.047c0 .414-.324.738-.756.738-.414 0-.738-.324-.738-.738v-10.047h-3.259c-.36 0-.647-.288-.647-.684 0-.361.287-.648.647-.648h8.03c.36 0 .648.288.648.685.001.359-.288.647-.648.647z"
        fill="#ffffff"
      />
    </DocumentIconFrame>
  );
}

export function ResumeDocumentFileIcon({ kind, ...props }: ResumeDocumentFileIconProps) {
  if (kind === "docx") {
    return <DocxDocumentIcon {...props} />;
  }
  if (kind === "xlsx") {
    return <XlsxDocumentIcon {...props} />;
  }
  if (kind === "pptx") {
    return <PptxDocumentIcon {...props} />;
  }
  if (kind === "image") {
    return <ImageDocumentIcon {...props} />;
  }
  return <PdfDocumentIcon {...props} />;
}
