import { useEffect, useRef } from 'react';
import { Chapter } from '../types';

interface ChapterListProps {
  chapters: Chapter[];
  currentChapterIndex: number;
  onChapterClick: (startTime: number, index: number) => void;
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ChapterList({
  chapters,
  currentChapterIndex,
  onChapterClick,
}: ChapterListProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  // Scroll active chapter into view when it changes
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentChapterIndex]);

  if (chapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center mb-4">
          <svg
            className="w-7 h-7 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 10h16M4 14h16M4 18h16"
            />
          </svg>
        </div>
        <p className="text-gray-400 font-medium">No chapter markers found</p>
        <p className="text-gray-600 text-sm mt-1">
          This file doesn't contain chapter metadata — the audio is still playable below
        </p>
      </div>
    );
  }

  return (
    <div className="py-2">
      <p className="px-6 pt-5 pb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
        {chapters.length} {chapters.length === 1 ? 'Chapter' : 'Chapters'}
      </p>

      <ul>
        {chapters.map((chapter, index) => {
          const isActive = index === currentChapterIndex;
          return (
            <li key={chapter.id}>
              <button
                ref={isActive ? activeRef : undefined}
                className={`w-full flex items-center gap-4 px-6 py-3.5 text-left transition-colors ${
                  isActive
                    ? 'bg-indigo-950/60 hover:bg-indigo-950/80'
                    : 'hover:bg-gray-900'
                }`}
                onClick={() => onChapterClick(chapter.startTime, index)}
              >
                {/* Index / active indicator */}
                <div
                  className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {isActive ? (
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>

                {/* Title */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-medium truncate text-sm leading-snug ${
                      isActive ? 'text-indigo-300' : 'text-gray-200'
                    }`}
                  >
                    {chapter.title}
                  </p>
                  {chapter.endTime != null && (
                    <p className="text-gray-600 text-xs mt-0.5">
                      {formatTime(chapter.endTime - chapter.startTime)} long
                    </p>
                  )}
                </div>

                {/* Start timestamp */}
                <span className="flex-shrink-0 text-xs font-mono text-gray-500">
                  {formatTime(chapter.startTime)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
