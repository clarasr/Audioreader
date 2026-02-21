// src/hooks/usePlayback.ts
import { useRef, useState, useEffect, useCallback } from 'react';
import { transcriptionQueue, TranscriptionQueue } from '../lib/transcriptionQueue.js';
import { getChunkCount, CHUNK_DURATION_S } from '../lib/audioChunker.js';
import type { Book, Chapter, TimestampedSentence, PlaybackState } from '../types/index.js';

/** Binary search: last sentence index whose timeSeconds <= currentTime */
function findSentenceIndex(sentences: TimestampedSentence[], currentTime: number): number {
  if (sentences.length === 0) return 0;
  let lo = 0, hi = sentences.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (sentences[mid].timeSeconds <= currentTime) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(0, hi);
}

export interface UsePlaybackReturn {
  state: PlaybackState;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  setPlaybackRate: (rate: number) => void;
  jumpToSentence: (index: number) => void;
}

export function usePlayback(params: {
  book: Book;
  chapter: Chapter;
  file: File;
  startPositionSeconds: number;
  queue?: TranscriptionQueue;
}): UsePlaybackReturn {
  const { book, chapter, file, startPositionSeconds, queue = transcriptionQueue } = params;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const prefetchedRef = useRef<Set<number>>(new Set());

  const [state, setState] = useState<PlaybackState>({
    status: 'buffering',
    currentBook: book,
    currentChapterIndex: chapter.index,
    currentPositionSeconds: startPositionSeconds,
    playbackRate: 1.0,
    sentences: [],
    currentSentenceIndex: 0,
    bufferedSeconds: 0,
    transcriptionError: null,
  });

  // Keep a ref copy of state.sentences for the RAF loop (avoids closure staleness)
  const sentencesRef = useRef<TimestampedSentence[]>([]);
  sentencesRef.current = state.sentences;

  // ── Bootstrap: create audio element + transcribe first chunk ─────────────
  useEffect(() => {
    let cancelled = false;

    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;

    const audio = new Audio(objectUrl);
    audio.currentTime = chapter.startSeconds + startPositionSeconds;
    audio.playbackRate = state.playbackRate;
    audioRef.current = audio;

    // Transcribe first chunk
    queue.fetchNow(file, book, chapter, 0).then((sentences) => {
      if (cancelled) return;
      sentencesRef.current = sentences;
      setState(prev => ({
        ...prev,
        status: 'paused',
        sentences,
        currentSentenceIndex: findSentenceIndex(sentences, startPositionSeconds),
        bufferedSeconds: CHUNK_DURATION_S,
      }));
    }).catch(err => {
      if (cancelled) return;
      setState(prev => ({ ...prev, status: 'error', transcriptionError: String(err) }));
    });

    // Listen for queue updates (background chunks ready)
    const unsub = queue.onReady((bId, chIdx, chunkIdx, newSentences) => {
      if (bId !== book.id || chIdx !== chapter.index) return;
      setState(prev => {
        const totalChunks = getChunkCount(chapter);
        const all = queue.getChapterSentences(book.id, chapter.index, totalChunks);
        return {
          ...prev,
          sentences: all,
          bufferedSeconds: queue.bufferedAhead(book.id, chapter.index, prev.currentPositionSeconds, chapter.startSeconds),
        };
      });
    });

    return () => {
      cancelled = true;
      unsub();
      audio.pause();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      audioRef.current = null;
    };
  }, [book.id, chapter.index]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── RAF loop ─────────────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let lastIdx = -1;

    const loop = () => {
      const posInChapter = audio.currentTime - chapter.startSeconds;
      const idx = findSentenceIndex(sentencesRef.current, posInChapter);

      // Only update React state when sentence index changes
      if (idx !== lastIdx) {
        lastIdx = idx;
        setState(prev => ({
          ...prev,
          currentPositionSeconds: posInChapter,
          currentSentenceIndex: idx,
          bufferedSeconds: queue.bufferedAhead(book.id, chapter.index, posInChapter, chapter.startSeconds),
        }));
      } else {
        // Still update position even if sentence didn't change (for progress bar)
        setState(prev => ({ ...prev, currentPositionSeconds: posInChapter }));
      }

      // Trigger background prefetch 30s before chunk ends
      const currentChunkIdx = Math.floor(posInChapter / CHUNK_DURATION_S);
      const posInChunk = posInChapter % CHUNK_DURATION_S;
      const nextChunkIdx = currentChunkIdx + 1;
      if (posInChunk >= 60 && !prefetchedRef.current.has(nextChunkIdx)) {
        prefetchedRef.current.add(nextChunkIdx);
        queue.prefetch(file, book, chapter, nextChunkIdx);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [book.id, chapter.index, chapter.startSeconds, file, queue]);

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────
  const play = useCallback(() => {
    audioRef.current?.play();
    setState(prev => ({ ...prev, status: 'playing' }));
    startLoop();
  }, [startLoop]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setState(prev => ({ ...prev, status: 'paused' }));
    stopLoop();
  }, [stopLoop]);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(seconds, chapter.durationSeconds));
    audio.currentTime = chapter.startSeconds + clamped;
    const idx = findSentenceIndex(sentencesRef.current, clamped);
    setState(prev => ({ ...prev, currentPositionSeconds: clamped, currentSentenceIndex: idx }));
  }, [chapter.startSeconds, chapter.durationSeconds]);

  const skipForward = useCallback((seconds = 15) => {
    setState(prev => { seekTo(prev.currentPositionSeconds + seconds); return prev; });
  }, [seekTo]);

  const skipBackward = useCallback((seconds = 15) => {
    setState(prev => { seekTo(prev.currentPositionSeconds - seconds); return prev; });
  }, [seekTo]);

  const setPlaybackRate = useCallback((rate: number) => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
    setState(prev => ({ ...prev, playbackRate: rate }));
  }, []);

  const jumpToSentence = useCallback((index: number) => {
    const sentence = sentencesRef.current[index];
    if (sentence) seekTo(sentence.timeSeconds);
  }, [seekTo]);

  // Save progress periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (state.status !== 'playing') return;
      fetch(`/api/books/${book.id}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterIndex: chapter.index, positionSeconds: state.currentPositionSeconds }),
      }).catch(() => {}); // fire and forget
    }, 10_000);
    return () => clearInterval(interval);
  }, [book.id, chapter.index, state.status, state.currentPositionSeconds]);

  return { state, play, pause, seekTo, skipForward, skipBackward, setPlaybackRate, jumpToSentence };
}
