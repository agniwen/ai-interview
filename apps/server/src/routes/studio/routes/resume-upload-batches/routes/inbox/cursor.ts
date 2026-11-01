export interface UploadTaskInboxCursor {
  batchCreatedAt: Date;
  batchId: string;
  itemId: string;
  orderIndex: number;
}

const CURSOR_SEPARATOR = "~";

export function encodeUploadTaskInboxCursor(cursor: UploadTaskInboxCursor): string {
  return [
    cursor.batchCreatedAt.toISOString(),
    cursor.batchId,
    String(cursor.orderIndex),
    cursor.itemId,
  ].join(CURSOR_SEPARATOR);
}

export function decodeUploadTaskInboxCursor(value: string): UploadTaskInboxCursor | null {
  const [createdAtValue, batchId, orderIndexValue, itemId, ...rest] = value.split(CURSOR_SEPARATOR);
  const batchCreatedAt = new Date(createdAtValue ?? "");
  const orderIndex = Number(orderIndexValue);
  if (
    rest.length > 0 ||
    !batchId ||
    !itemId ||
    Number.isNaN(batchCreatedAt.getTime()) ||
    !Number.isInteger(orderIndex) ||
    orderIndex < 0
  ) {
    return null;
  }
  return { batchCreatedAt, batchId, itemId, orderIndex };
}
