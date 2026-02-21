// src/lib/transcriptionQueue.ts
import { sliceChunk, blobToBase64, getChunkCount, CHUNK_DURATION_S } from './audioChunker.js';
import { transcribeChunk } from './transcriptionClient.js';
import type { Book, Chapter, TimestampedSentence, ChunkQueueItem } from '../types/index.js';

type ChunkKey = string; // `${bookId}:${chapterIdx}:${chunkIdx}`

function key(bookId: string, chapterIndex: number, chunkIndex: number): ChunkKey {
  return `${bookId}:${chapterIndex}:${chunkIndex}`;
}

export class TranscriptionQueue {
  private cache = new Map<ChunkKey, TimestampedSentence[]>();
  private inflight = new Set<ChunkKey>();
  private queue: Array<() => Promise<void>> = [];
  private running = false;
  private onReadyCallbacks: Array<(bookId: string, chapterIndex: number, chunkIndex: number, sentences: TimestampedSentence[]) => void> = [];

  onReady(cb: (bookId: string, chapterIndex: number, chunkIndex: number, sentences: TimestampedSentence[]) => void) {
    this.onReadyCallbacks.push(cb);
    return () => { this.onReadyCallbacks = this.onReadyCallbacks.filter(f => f !== cb); };
  }

  get(bookId: string, chapterIndex: number, chunkIndex: number): TimestampedSentence[] | undefined {
    return this.cache.get(key(bookId, chapterIndex, chunkIndex));
  }

  isReady(bookId: string, chapterIndex: number, chunkIndex: number): boolean {
    return this.cache.has(key(bookId, chapterIndex, chunkIndex));
  }

  /** Fetch a chunk, waiting for the result (used for chunk 0 before playback starts) */
  async fetchNow(file: File, book: Book, chapter: Chapter, chunkIndex: number): Promise<TimestampedSentence[]> {
    const k = key(book.id, chapter.index, chunkIndex);
    if (this.cache.has(k)) return this.cache.get(k)!;

    const chunk = sliceChunk(file, book, chapter, chunkIndex);
    const audioBase64 = await blobToBase64(chunk.blob);
    const sentences = await transcribeChunk({
      audioBase64,
      mimeType: book.mimeType,
      bookId: book.id,
      chapterIndex: chapter.index,
      chunkIndex,
      chunkStartSeconds: chunk.startSeconds,
      chunkDurationSeconds: chunk.durationSeconds,
    });

    this.cache.set(k, sentences);
    this.onReadyCallbacks.forEach(cb => cb(book.id, chapter.index, chunkIndex, sentences));
    return sentences;
  }

  /** Schedule a chunk for background transcription (non-blocking) */
  prefetch(file: File, book: Book, chapter: Chapter, chunkIndex: number): void {
    const k = key(book.id, chapter.index, chunkIndex);
    if (this.cache.has(k) || this.inflight.has(k)) return;
    if (chunkIndex >= getChunkCount(chapter)) return;

    this.inflight.add(k);
    this.queue.push(async () => {
      try {
        await this.fetchNow(file, book, chapter, chunkIndex);
      } finally {
        this.inflight.delete(k);
      }
    });
    this.drain();
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();
    }
    this.running = false;
  }

  /** Returns all cached sentences for a chapter assembled in order */
  getChapterSentences(bookId: string, chapterIndex: number, totalChunks: number): TimestampedSentence[] {
    const all: TimestampedSentence[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const sentences = this.cache.get(key(bookId, chapterIndex, i));
      if (sentences) all.push(...sentences);
    }
    return all;
  }

  /** Seconds of chapter audio that have been transcribed ahead of a position */
  bufferedAhead(bookId: string, chapterIndex: number, currentPositionSeconds: number, chapterStartSeconds: number): number {
    // Find the last ready chunk whose start is >= currentPosition
    let buffered = 0;
    let chunkIdx = 0;
    while (true) {
      const chunkStart = chunkIdx * CHUNK_DURATION_S + chapterStartSeconds;
      const k = key(bookId, chapterIndex, chunkIdx);
      if (!this.cache.has(k)) break;
      if (chunkStart + CHUNK_DURATION_S > currentPositionSeconds) {
        buffered = chunkStart + CHUNK_DURATION_S - currentPositionSeconds;
      }
      chunkIdx++;
    }
    return Math.max(0, buffered);
  }

  clear() {
    this.cache.clear();
    this.inflight.clear();
    this.queue = [];
  }
}

// Singleton
export const transcriptionQueue = new TranscriptionQueue();
