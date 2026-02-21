// src/types/index.ts

export interface Chapter {
  index: number;
  title: string;
  startMs: number;
  durationMs: number;
  startSeconds: number;
  durationSeconds: number;
}

export interface Book {
  id: string; // 16-char hex fingerprint of first 64KB
  title: string;
  author: string;
  coverArtDataUrl: string | null;
  totalDurationMs: number;
  fileSizeBytes: number;
  mimeType: string;
  chapters: Chapter[];
  lastOpenedAt?: number;
  lastChapterIndex?: number;
  lastPositionSeconds?: number;
}

export interface TimestampedSentence {
  timeSeconds: number; // relative to chapter start
  text: string;
}

export interface ChunkTranscription {
  bookId: string;
  chapterIndex: number;
  chunkIndex: number;
  chunkStartSeconds: number;
  sentences: TimestampedSentence[];
}

export type PlaybackStatus = 'idle' | 'loading' | 'buffering' | 'playing' | 'paused' | 'error';

export interface PlaybackState {
  status: PlaybackStatus;
  currentBook: Book | null;
  currentChapterIndex: number;
  currentPositionSeconds: number;
  playbackRate: number;
  sentences: TimestampedSentence[];
  currentSentenceIndex: number;
  bufferedSeconds: number;
  transcriptionError: string | null;
}

export type ChunkStatus = 'pending' | 'transcribing' | 'ready' | 'error';

export interface ChunkQueueItem {
  chunkIndex: number;
  chunkStartSeconds: number;
  status: ChunkStatus;
  transcription?: ChunkTranscription;
  error?: string;
}

export interface TranscribeRequest {
  audioBase64: string;
  mimeType: string;
  bookId: string;
  chapterIndex: number;
  chunkIndex: number;
  chunkStartSeconds: number;
  chunkDurationSeconds: number;
}

export interface TranscribeResponse {
  sentences: TimestampedSentence[];
  fromCache: boolean;
}

export type Screen =
  | { name: 'library' }
  | { name: 'bookDetail'; book: Book }
  | { name: 'player'; book: Book; chapterIndex: number; startPositionSeconds: number }
  | { name: 'settings' };
