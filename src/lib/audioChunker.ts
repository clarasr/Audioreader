// src/lib/audioChunker.ts
import type { Book, Chapter } from '../types/index.js';

export const CHUNK_DURATION_S = 90;
const OVERLAP_S = 2; // lead-in overlap for all chunks after chunk 0

export function getChunkCount(chapter: Chapter): number {
  return Math.ceil(chapter.durationSeconds / CHUNK_DURATION_S);
}

export interface AudioChunk {
  blob: Blob;
  chunkIndex: number;
  /** Absolute time in chapter (no overlap) — used for Gemini prompt */
  startSeconds: number;
  durationSeconds: number;
}

export function sliceChunk(
  file: File,
  book: Book,
  chapter: Chapter,
  chunkIndex: number
): AudioChunk {
  const chunkStartInChapter = chunkIndex * CHUNK_DURATION_S;
  const chunkEndInChapter = Math.min(chunkStartInChapter + CHUNK_DURATION_S, chapter.durationSeconds);
  const durationSeconds = chunkEndInChapter - chunkStartInChapter;

  // Absolute time in file
  const absStart = chapter.startSeconds + chunkStartInChapter;
  const absEnd = chapter.startSeconds + chunkEndInChapter;

  // Proportional byte approximation
  const totalDurationS = book.totalDurationMs / 1000;
  const bytesPerSecond = book.fileSizeBytes / totalDurationS;

  const byteStart = Math.floor(absStart * bytesPerSecond);
  const byteEnd = Math.ceil(absEnd * bytesPerSecond);

  // Apply lead-in overlap for chunks after the first to avoid word cutoff
  const effectiveByteStart = chunkIndex === 0
    ? byteStart
    : Math.max(0, byteStart - Math.floor(OVERLAP_S * bytesPerSecond));

  return {
    blob: file.slice(effectiveByteStart, byteEnd, book.mimeType),
    chunkIndex,
    startSeconds: chapter.startSeconds + chunkStartInChapter,
    durationSeconds,
  };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data:mime;base64,
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
