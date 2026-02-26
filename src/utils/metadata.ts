import * as mm from 'music-metadata-browser';
import { IAudioMetadata } from 'music-metadata-browser';
import { BookMetadata, Chapter } from '../types';

export async function parseAudioBook(file: File): Promise<BookMetadata> {
  const metadata = await mm.parseBlob(file, {
    duration: true,
    skipCovers: false,
    includeChapters: true,
  });

  const { common, format, native } = metadata;

  // Basic info
  const title = common.title || file.name.replace(/\.[^/.]+$/, '');
  const artist = common.artist || common.albumartist;
  const album = common.album;
  const year = common.year?.toString();
  const duration = format.duration;

  // Cover art
  let coverUrl: string | undefined;
  if (common.picture && common.picture.length > 0) {
    const pic = common.picture[0];
    const blob = new Blob([pic.data], { type: pic.format });
    coverUrl = URL.createObjectURL(blob);
  }

  // File URL for playback
  const fileUrl = URL.createObjectURL(file);

  // Chapters — try multiple sources
  const chapters =
    extractFormatChapters(format) ||
    extractNativeChapters(native) ||
    [];

  return { title, artist, album, year, duration, coverUrl, chapters, fileUrl };
}

/** M4B/MP4 chapters parsed by music-metadata into format.chapters (IChapter[]) */
function extractFormatChapters(format: IAudioMetadata['format']): Chapter[] | null {
  const raw = format.chapters;
  if (!raw || raw.length === 0) return null;
  const sampleRate = format.sampleRate ?? 44100;
  return raw.map((ch: mm.IChapter, index: number) => ({
    id: `chap-${index}`,
    title: ch.title || `Chapter ${index + 1}`,
    startTime: ch.sampleOffset / sampleRate,
  }));
}

/** ID3 CHAP tags (MP3) and Nero chpl atoms (M4B fallback) from native tags */
function extractNativeChapters(
  native: { [tagType: string]: mm.ITag[] } | undefined
): Chapter[] | null {
  if (!native) return null;

  // ID3 CHAP frames
  for (const [tagType, tags] of Object.entries(native)) {
    if (!tagType.startsWith('ID3')) continue;
    const chapTags = tags.filter((t) => t.id === 'CHAP');
    if (chapTags.length > 0) {
      const chapters = chapTags
        .map((tag, index) => {
          const chap = tag.value as {
            elementID?: string;
            startTime?: number;
            endTime?: number;
            tags?: { title?: string };
          };
          return {
            id: `chap-${index}`,
            title:
              chap.tags?.title ||
              chap.elementID ||
              `Chapter ${index + 1}`,
            startTime: (chap.startTime ?? 0) / 1000,
            endTime:
              chap.endTime != null ? chap.endTime / 1000 : undefined,
          };
        })
        .sort((a, b) => a.startTime - b.startTime);
      if (chapters.length > 0) return chapters;
    }
  }

  // Nero chpl atom
  for (const tags of Object.values(native)) {
    const chplTag = tags.find((t) => t.id === 'chpl');
    if (chplTag && Array.isArray(chplTag.value)) {
      const chapters = (
        chplTag.value as Array<{ startTime?: number; name?: string }>
      )
        .map((ch, index) => ({
          id: `chap-${index}`,
          title: ch.name || `Chapter ${index + 1}`,
          startTime: ch.startTime ?? 0,
        }))
        .sort((a, b) => a.startTime - b.startTime);
      if (chapters.length > 0) return chapters;
    }
  }

  return null;
}
