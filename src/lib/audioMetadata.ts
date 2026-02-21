// src/lib/audioMetadata.ts
import * as mm from 'music-metadata-browser';
import type { Book, Chapter } from '../types/index.js';

export async function parseAudioFile(file: File): Promise<Book> {
  const metadata = await mm.parseBlob(file, { skipCovers: false });
  const { common, format } = metadata;

  const totalDurationMs = (format.duration ?? 0) * 1000;
  const rawChapters = (common as any).chapter as Array<{ title: string; startPosition: number }> | undefined;

  const chapters = normalizeChapters(rawChapters ?? [], totalDurationMs);
  const coverArtDataUrl = await extractCoverArt(common.picture?.[0]);
  const id = await computeBookId(file);

  return {
    id,
    title: common.title ?? stripExtension(file.name),
    author: common.artist ?? common.albumartist ?? 'Unknown Author',
    coverArtDataUrl,
    totalDurationMs,
    fileSizeBytes: file.size,
    mimeType: file.type || detectMimeType(file.name),
    chapters,
  };
}

function normalizeChapters(
  raw: Array<{ title: string; startPosition: number }>,
  totalDurationMs: number
): Chapter[] {
  if (raw.length === 0) {
    return [{
      index: 0,
      title: 'Full Book',
      startMs: 0,
      durationMs: totalDurationMs,
      startSeconds: 0,
      durationSeconds: totalDurationMs / 1000,
    }];
  }
  return raw.map((ch, i) => {
    const nextStart = raw[i + 1]?.startPosition ?? totalDurationMs;
    const durationMs = nextStart - ch.startPosition;
    return {
      index: i,
      title: ch.title || `Chapter ${i + 1}`,
      startMs: ch.startPosition,
      durationMs,
      startSeconds: ch.startPosition / 1000,
      durationSeconds: durationMs / 1000,
    };
  });
}

async function extractCoverArt(picture?: mm.IPicture): Promise<string | null> {
  if (!picture) return null;
  // Convert to data URL so it survives page reload (object URLs are session-only)
  return new Promise((resolve) => {
    const blob = new Blob([picture.data], { type: picture.format });
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function computeBookId(file: File): Promise<string> {
  const sample = file.slice(0, 65536);
  const buffer = await sample.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function detectMimeType(name: string): string {
  if (name.endsWith('.m4b') || name.endsWith('.m4a')) return 'audio/mp4';
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.ogg')) return 'audio/ogg';
  return 'audio/mpeg';
}
