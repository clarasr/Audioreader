// src/screens/PlayerScreen.tsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayback } from '../hooks/usePlayback.js';
import { useIdleDetection } from '../hooks/useIdleDetection.js';
import { getChunkCount } from '../lib/audioChunker.js';
import { LoadingScreen } from './LoadingScreen.js';
import { BufferIndicator } from '../components/BufferIndicator.js';
import { PlayerControls } from '../components/PlayerControls.js';
import { PlayerHeader } from '../components/PlayerHeader.js';
import { ReadingView } from '../components/ReadingView.js';
import type { Book, Chapter } from '../types/index.js';

interface Props {
  book: Book;
  chapterIndex: number;
  startPositionSeconds: number;
  file: File;
  onBack: () => void;
}

import { ControlsOverlay } from '../components/ControlsOverlay.js';

export function PlayerScreen({ book, chapterIndex, startPositionSeconds, file, onBack }: Props) {
  const chapter: Chapter = book.chapters[chapterIndex];
  const isIdle = useIdleDetection(3000);
  const [overlayOpen, setOverlayOpen] = useState(false);

  const { state, play, pause, seekTo, skipForward, skipBackward, setPlaybackRate, jumpToSentence } =
    usePlayback({ book, chapter, file, startPositionSeconds });

  // Show loading screen until first chunk is ready
  if (state.status === 'buffering' || state.status === 'loading') {
    return (
      <LoadingScreen
        book={book}
        chapter={chapter}
        chunkIndex={0}
        totalChunks={getChunkCount(chapter)}
      />
    );
  }

  const isPlaying = state.status === 'playing';

  return (
    <div
      className="relative w-full h-screen bg-black font-sans overflow-hidden"
      onMouseMove={() => {}} // idle detection handled by hook
    >
      <div className="relative w-full h-full max-w-lg mx-auto flex flex-col items-center justify-center">
        {/* Background cover art */}
        <div className="absolute inset-0 w-full h-full z-0">
          {book.coverArtDataUrl ? (
            <img
              src={book.coverArtDataUrl}
              alt=""
              className="w-full h-full object-cover blur-2xl scale-110"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900" />
          )}
          <div className="absolute inset-0 bg-black/60" />
        </div>

        <PlayerHeader
          bookTitle={book.title}
          chapterTitle={chapter.title}
          onBack={() => { pause(); onBack(); }}
          isIdle={isIdle}
        />

        <main className="w-full flex-grow flex flex-col justify-center items-center pt-20 pb-48 overflow-hidden">
          <ReadingView
            sentences={state.sentences}
            currentSentenceIndex={state.currentSentenceIndex}
            isIdle={isIdle}
            onJumpToSentence={jumpToSentence}
          />
        </main>

        <BufferIndicator
          isIdle={isIdle}
          bufferedSeconds={state.bufferedSeconds}

        />

        <PlayerControls
          isIdle={isIdle}
          isPlaying={isPlaying}
          currentPositionSeconds={state.currentPositionSeconds}
          chapterDurationSeconds={chapter.durationSeconds}
          playbackRate={state.playbackRate}
          onPlay={play}
          onPause={pause}
          onSeek={seekTo}
          onSkipForward={() => skipForward(15)}
          onSkipBackward={() => skipBackward(15)}
          onSetPlaybackRate={setPlaybackRate}
          onOpenOverlay={() => setOverlayOpen(true)}
        />

        <ControlsOverlay
          isOpen={overlayOpen}
          onClose={() => setOverlayOpen(false)}
          book={book}
          chapter={chapter}
          currentPositionSeconds={state.currentPositionSeconds}
          playbackRate={state.playbackRate}
          onSeek={seekTo}
          onSetPlaybackRate={setPlaybackRate}
          onJumpToChapter={(newChapterIndex) => {
            // This is a simplified jump, a full implementation would need to re-init usePlayback
            if (newChapterIndex !== chapterIndex) {
              onBack(); // Go back to detail, user can then select new chapter
            }
          }}
        />
      </div>
    </div>
  );
}
