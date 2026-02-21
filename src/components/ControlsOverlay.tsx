// src/components/ControlsOverlay.tsx
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { Book, Chapter } from '../types/index.js';
import { formatTime } from '../lib/formatTime.js';

const SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];
const SLEEP_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '15m', value: 15 * 60 },
  { label: '30m', value: 30 * 60 },
  { label: '45m', value: 45 * 60 },
  { label: 'Chapter', value: -1 },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  chapter: Chapter;
  currentPositionSeconds: number;
  playbackRate: number;
  onSeek: (seconds: number) => void;
  onSetPlaybackRate: (rate: number) => void;
  onJumpToChapter: (chapterIndex: number) => void;
}

export function ControlsOverlay({
  isOpen, onClose, book, chapter, currentPositionSeconds,
  playbackRate, onSeek, onSetPlaybackRate, onJumpToChapter,
}: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/50 z-30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-40 bg-[#1a1a1a] rounded-t-3xl p-6 pb-10 max-w-lg mx-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-6" />

            <button className="absolute top-4 right-4 p-2 text-white/40 hover:text-white" onClick={onClose}>
              <X size={18} />
            </button>

            {/* Full scrubber */}
            <div className="mb-6">
              <div className="flex justify-between text-xs text-white/40 font-sans mb-2">
                <span>{formatTime(currentPositionSeconds)}</span>
                <span>{formatTime(chapter.durationSeconds)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={chapter.durationSeconds}
                value={currentPositionSeconds}
                onChange={e => onSeek(Number(e.target.value))}
                className="w-full accent-white cursor-pointer"
              />
              {/* Chapter markers */}
              <div className="relative h-4 mt-1">
                {book.chapters.map(ch => {
                  const pct = (ch.startSeconds / (book.totalDurationMs / 1000)) * 100;
                  return (
                    <button
                      key={ch.index}
                      className="absolute -translate-x-1/2 text-white/20 text-xs font-sans hover:text-white/60"
                      style={{ left: `${pct}%` }}
                      onClick={() => { onJumpToChapter(ch.index); onClose(); }}
                      title={ch.title}
                    >
                      |
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Speed */}
            <div className="mb-6">
              <p className="text-white/40 font-sans text-xs uppercase tracking-widest mb-3">Speed</p>
              <div className="flex gap-2">
                {SPEEDS.map(speed => (
                  <button
                    key={speed}
                    className={`flex-1 py-2 rounded-xl text-sm font-sans transition-colors ${
                      speed === playbackRate ? 'bg-white text-black' : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                    onClick={() => onSetPlaybackRate(speed)}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            {/* Chapters quick-jump */}
            <div>
              <p className="text-white/40 font-sans text-xs uppercase tracking-widest mb-3">Chapters</p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-2 px-2">
                {book.chapters.map(ch => (
                  <button
                    key={ch.index}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-sans transition-colors ${
                      ch.index === chapter.index ? 'bg-white text-black' : 'bg-white/10 text-white/60'
                    }`}
                    onClick={() => { onJumpToChapter(ch.index); onClose(); }}
                  >
                    {ch.title}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
