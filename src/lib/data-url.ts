const DATA_URL_REGEX = /^data:([^,]*),([\s\S]*)$/;

export function decodeDataUrl(dataUrl: string): {
  data: Uint8Array
  mediaType: string | undefined
} {
  const match = dataUrl.match(DATA_URL_REGEX);

  if (!match) {
    throw new Error('Invalid data URL format.');
  }

  const meta = match[1] ?? '';
  const payload = match[2] ?? '';
  const mediaType = meta.split(';')[0]?.trim() || undefined;
  const isBase64 = meta.includes(';base64');

  if (isBase64) {
    return {
      data: Uint8Array.from(Buffer.from(payload, 'base64')),
      mediaType,
    };
  }

  return {
    data: Uint8Array.from(Buffer.from(decodeURIComponent(payload), 'utf8')),
    mediaType,
  };
}
