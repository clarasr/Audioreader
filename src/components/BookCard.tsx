// src/components/BookCard.tsx
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import type { Book } from '../types/index.js';
import { formatTime } from '../lib/formatTime.js';

interface Props {
  book: Book;
  onClick: () => void;
  compact?: boolean;
}

export function BookCard({ book, onClick, compact = false }: Props) {
  const progress = book.lastPositionSeconds && book.totalDurationMs
    ? (book.lastPositionSeconds / (book.totalDurationMs / 1000)) * 100
    : 0;

  return (
    <motion.div
      className={`relative rounded-2xl overflow-hidden bg-white/5 cursor-pointer ${compact ? 'w-36' : 'w-full'}`}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
    >
      <div className={`relative ${compact ? 'aspect-[2/3]' : 'aspect-[2/3]'} w-full`}>
        {book.coverArtDataUrl ? (
          <img src={book.coverArtDataUrl} alt={book.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
            <span className="text-white/20 font-serif text-4xl">{book.title[0]}</span>
          </div>
        )}

        {/* Progress bar overlay */}
        {progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
            <div className="h-full bg-white/80" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {!compact && (
        <div className="p-3">
          <p className="text-white font-serif text-sm leading-tight truncate">{book.title}</p>
          <p className="text-white/50 font-sans text-xs mt-0.5 truncate">{book.author}</p>
          {progress > 0 && book.lastPositionSeconds && (
            <p className="text-white/30 font-sans text-xs mt-1">
              {formatTime(book.lastPositionSeconds)} in
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
