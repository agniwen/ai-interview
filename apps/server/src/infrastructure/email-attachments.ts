export async function buildEmailAttachments(attachments: readonly File[]) {
  return await Promise.all(
    attachments.map(async (file) => ({
      content: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
      filename: file.name,
    })),
  );
}
