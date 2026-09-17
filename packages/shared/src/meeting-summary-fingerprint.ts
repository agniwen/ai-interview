/** Ordered transcript prefix fingerprint; batching does not affect the result. */
export async function extendSummaryFingerprint(
  previous: { digest: string; count: number } | undefined,
  turns: { id: string; text: string; startMs: number; endMs: number }[],
) {
  let digest = previous?.digest ?? "meeting-summary-source-v1";
  for (const turn of turns) {
    const bytes = new TextEncoder().encode(
      JSON.stringify([digest, turn.id, turn.text, turn.startMs, turn.endMs]),
    );
    digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }
  return { count: (previous?.count ?? 0) + turns.length, digest };
}
