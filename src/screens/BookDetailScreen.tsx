// src/screens/BookDetailScreen.tsx
import { motion } from 'framer-motion';
import { ChevronLeft, Play } from 'lucide-react';
import { ChapterListItem } from '../components/ChapterListItem.js';
import { formatTime } from '../lib/formatTime.js';
import type { Book } from '../types/index.js';

interface Props {
  book: Book;
  onBack: () => void;
  onPlayChapter: (chapterIndex: number, startPositionSeconds?: number) => void;
}

export function BookDetailScreen({ book, onBack, onPlayChapter }: Props) {
  const hasProgress = book.lastPositionSeconds && book.lastPositionSeconds > 10;
  const resumeChapter = book.lastChapterIndex ?? 0;
  const resumePosition = book.lastPositionSeconds ?? 0;

  return (
    <div className="w-full min-h-screen bg-background text-white overflow-y-auto pb-24">
      {/* Cover art hero */}
      <div className="relative w-full aspect-[4/3] overflow-hidden">
        {book.coverArtDataUrl ? (
          <img src={book.coverArtDataUrl} alt={book.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />

        {/* Back button */}
        <button
          className="absolute top-12 left-4 p-2 bg-black/40 backdrop-blur-sm rounded-full text-white"
          onClick={onBack}
        >
          <ChevronLeft size={22} />
        </button>
      </div>

      <div className="px-4 -mt-8 relative z-10">
        {/* Book info */}
        <div className="mb-6">
          <h1 className="font-serif text-2xl leading-tight">{book.title}</h1>
          <p className="font-sans text-white/50 text-sm mt-1">{book.author}</p>
          <p className="font-sans text-white/30 text-xs mt-1">
            {book.chapters.length} chapters · {formatTime(book.totalDurationMs / 1000)}
          </p>
        </div>

        {/* Play / Resume button */}
        <div className="flex gap-3 mb-8">
          {hasProgress && (
            <motion.button
              className="flex-1 flex items-center justify-center gap-2 bg-white text-black py-3 rounded-xl font-sans font-medium text-sm"
              whileTap={{ scale: 0.97 }}
              onClick={() => onPlayChapter(resumeChapter, resumePosition)}
            >
              <Play size={16} />
              Resume
            </motion.button>
          )}
          <motion.button
            className={`flex items-center justify-center gap-2 ${hasProgress ? 'px-4 bg-white/10 text-white' : 'flex-1 bg-white text-black'} py-3 rounded-xl font-sans font-medium text-sm`}
            whileTap={{ scale: 0.97 }}
            onClick={() => onPlayChapter(0, 0)}
          >
            <Play size={16} />
            {hasProgress ? 'Start Over' : 'Play'}
          </motion.button>
        </div>

        {/* Chapter list */}
        <div>
          <h2 className="font-sans text-xs uppercase tracking-widest text-white/40 mb-2">Chapters</h2>
          <div className="space-y-1">
            {book.chapters.map((chapter) => (
              <ChapterListItem
                key={chapter.index}
                chapter={chapter}
                isCurrent={chapter.index === book.lastChapterIndex}
                onPlay={() => onPlayChapter(chapter.index, 0)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
