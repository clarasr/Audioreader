import { useRef } from 'react';

interface AudioPlayerProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSkip: (seconds: number) => void;
  bookTitle: string;
  currentChapterTitle?: string;
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function AudioPlayer({
  isPlaying,
  currentTime,
  duration,
  onPlayPause,
  onSeek,
  onSkip,
  bookTitle,
  currentChapterTitle,
}: AudioPlayerProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current || duration === 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 px-5 pt-3 pb-5">
      {/* Progress bar */}
      <div
        ref={barRef}
        className="w-full h-1 bg-gray-700 rounded-full cursor-pointer mb-4 group relative"
        onClick={handleBarClick}
      >
        <div
          className="h-full bg-indigo-500 rounded-full transition-none relative"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow" />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {/* Track info */}
        <div className="flex-1 min-w-0">
          {currentChapterTitle ? (
            <>
              <p className="text-white text-sm font-medium truncate leading-tight">
                {currentChapterTitle}
              </p>
              <p className="text-gray-500 text-xs truncate mt-0.5">{bookTitle}</p>
            </>
          ) : (
            <p className="text-white text-sm font-medium truncate">{bookTitle}</p>
          )}
        </div>

        {/* Skip back 30s */}
        <button
          onClick={() => onSkip(-30)}
          className="p-2 text-gray-400 hover:text-white transition-colors"
          title="Skip back 30s"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
            <text x="8" y="15" fontSize="5" fontFamily="sans-serif" fill="currentColor">30</text>
          </svg>
        </button>

        {/* Play / Pause */}
        <button
          onClick={onPlayPause}
          className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 flex items-center justify-center transition-all shadow-lg flex-shrink-0"
        >
          {isPlaying ? (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Skip forward 30s */}
        <button
          onClick={() => onSkip(30)}
          className="p-2 text-gray-400 hover:text-white transition-colors"
          title="Skip forward 30s"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v4l5-5-5-5v4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2z" />
            <text x="8" y="15" fontSize="5" fontFamily="sans-serif" fill="currentColor">30</text>
          </svg>
        </button>

        {/* Time */}
        <div className="text-right flex-shrink-0 min-w-[4.5rem]">
          <p className="text-white text-sm font-mono leading-tight">
            {formatTime(currentTime)}
          </p>
          <p className="text-gray-500 text-xs font-mono">{formatTime(duration)}</p>
        </div>
      </div>
    </div>
  );
}
