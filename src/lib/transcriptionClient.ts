// src/lib/transcriptionClient.ts
import type { TimestampedSentence, TranscribeRequest, TranscribeResponse } from '../types/index.js';

export async function transcribeChunk(params: {
  audioBase64: string;
  mimeType: string;
  bookId: string;
  chapterIndex: number;
  chunkIndex: number;
  chunkStartSeconds: number;
  chunkDurationSeconds: number;
}): Promise<TimestampedSentence[]> {
  const payload: TranscribeRequest = params;

  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Transcription failed (${res.status}): ${text}`);
  }

  const data: TranscribeResponse = await res.json();
  return data.sentences;
}
