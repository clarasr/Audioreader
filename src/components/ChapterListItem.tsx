// src/components/ChapterListItem.tsx
import { Play } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Chapter } from '../types/index.js';
import { formatTime } from '../lib/formatTime.js';

interface Props {
  chapter: Chapter;
  isCurrent: boolean;
  onPlay: () => void;
}

export function ChapterListItem({ chapter, isCurrent, onPlay }: Props) {
  return (
    <motion.div
      className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-colors ${
        isCurrent ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
      whileTap={{ scale: 0.98 }}
      onClick={onPlay}
    >
      <div className="flex-1 min-w-0 mr-3">
        <p className={`font-sans text-sm truncate ${isCurrent ? 'text-white' : 'text-white/70'}`}>
          {chapter.title}
        </p>
        <p className="font-sans text-xs text-white/30 mt-0.5">{formatTime(chapter.durationSeconds)}</p>
      </div>
      <button className="p-2 text-white/40 hover:text-white transition-colors flex-shrink-0">
        <Play size={16} />
      </button>
    </motion.div>
  );
}
