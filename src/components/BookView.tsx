import { useState, useRef, useCallback, useEffect } from 'react';
import { BookMetadata } from '../types';
import ChapterList from './ChapterList';
import AudioPlayer from './AudioPlayer';

interface BookViewProps {
  book: BookMetadata;
  onBack: () => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function BookView({ book, onBack }: BookViewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(book.duration ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);

  // Keyboard shortcut: space to play/pause
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        handlePlayPause();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  // Track which chapter is currently playing
  const updateCurrentChapter = useCallback(
    (time: number) => {
      if (book.chapters.length === 0) return;
      let idx = 0;
      for (let i = book.chapters.length - 1; i >= 0; i--) {
        if (time >= book.chapters[i].startTime) {
          idx = i;
          break;
        }
      }
      setCurrentChapterIndex(idx);
    },
    [book.chapters]
  );

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    updateCurrentChapter(audio.currentTime);
  }, [updateCurrentChapter]);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio) setDuration(audio.duration);
  }, []);

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  }, []);

  const handleChapterClick = useCallback(
    (startTime: number, index: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = startTime;
      setCurrentChapterIndex(index);
      audio.play();
    },
    []
  );

  const handleSeek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
    }
  }, []);

  const handleSkip = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-gray-950/90 backdrop-blur border-b border-gray-800">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="Upload another book"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <span className="text-white font-semibold">AudioReader</span>
      </header>

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto pb-32">
        {/* Book info card */}
        <div className="p-6">
          <div className="flex gap-5 items-start">
            {/* Cover */}
            <div className="flex-shrink-0">
              {book.coverUrl ? (
                <img
                  src={book.coverUrl}
                  alt="Book cover"
                  className="w-28 h-28 rounded-xl object-cover shadow-2xl ring-1 ring-white/10"
                />
              ) : (
                <div className="w-28 h-28 rounded-xl bg-gradient-to-br from-indigo-900 via-purple-900 to-gray-900 flex items-center justify-center shadow-2xl ring-1 ring-white/10">
                  <svg
                    className="w-12 h-12 text-indigo-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 pt-1">
              <h1 className="text-xl font-bold text-white leading-snug line-clamp-2">
                {book.title}
              </h1>
              {book.artist && (
                <p className="text-indigo-400 text-sm mt-1 font-medium">{book.artist}</p>
              )}
              {book.album && book.album !== book.title && (
                <p className="text-gray-500 text-sm mt-0.5 truncate">{book.album}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                {book.chapters.length > 0 && (
                  <span className="text-xs text-gray-400 bg-gray-800 px-2.5 py-1 rounded-full">
                    {book.chapters.length} chapters
                  </span>
                )}
                {duration > 0 && (
                  <span className="text-xs text-gray-400 bg-gray-800 px-2.5 py-1 rounded-full">
                    {formatDuration(duration)}
                  </span>
                )}
                {book.year && (
                  <span className="text-xs text-gray-400 bg-gray-800 px-2.5 py-1 rounded-full">
                    {book.year}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-800 mx-6" />

        {/* Chapter list */}
        <ChapterList
          chapters={book.chapters}
          currentChapterIndex={currentChapterIndex}
          onChapterClick={handleChapterClick}
        />
      </main>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={book.fileUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Player bar */}
      <AudioPlayer
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        onPlayPause={handlePlayPause}
        onSeek={handleSeek}
        onSkip={handleSkip}
        bookTitle={book.title}
        currentChapterTitle={book.chapters[currentChapterIndex]?.title}
      />
    </div>
  );
}
