import type { WordToken } from '../types';

/**
 * Asks the server to transcribe a time range of the uploaded file.
 * Returns word-level tokens with absolute timestamps.
 *
 * @param fileId      The server-assigned ID from the upload step
 * @param startTime   Start of the segment (seconds into the file)
 * @param endTime     End of the segment (seconds into the file)
 * @param signal      Optional AbortSignal — used by Phase 3 to cancel in-flight requests
 */
export async function transcribeChunk(
  fileId: string,
  startTime: number,
  endTime: number,
  signal?: AbortSignal
): Promise<WordToken[]> {
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, startTime, endTime }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  const { words } = (await res.json()) as { words: WordToken[] };
  return words;
}
