export function getPptxPreviewPdfUrl(url: string) {
  const hashIndex = url.indexOf("#");
  const urlBeforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : url.slice(hashIndex);
  const queryIndex = urlBeforeHash.indexOf("?");
  const pathname = queryIndex === -1 ? urlBeforeHash : urlBeforeHash.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : urlBeforeHash.slice(queryIndex);

  return `${pathname}-preview.pdf${query}${hash}`;
}
