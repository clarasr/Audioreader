// src/screens/LoadingScreen.tsx
import { motion } from 'framer-motion';
import type { Book, Chapter } from '../types/index.js';

interface Props {
  book: Book;
  chapter: Chapter;
  chunkIndex: number;
  totalChunks: number;
}

export function LoadingScreen({ book, chapter, chunkIndex, totalChunks }: Props) {
  return (
    <div className="w-full h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
      {/* Blurred cover background */}
      {book.coverArtDataUrl && (
        <img
          src={book.coverArtDataUrl}
          className="absolute inset-0 w-full h-full object-cover blur-3xl scale-110 opacity-30"
          alt=""
        />
      )}
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10 flex flex-col items-center gap-8 px-8 text-center max-w-sm">
        {/* Animated waveform */}
        <div className="flex items-center gap-1.5 h-12">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="w-1 rounded-full bg-white/60"
              animate={{ scaleY: [0.4, 1.8, 0.4] }}
              transition={{
                repeat: Infinity,
                duration: 1.2,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
              style={{ height: 32 }}
            />
          ))}
        </div>

        <div>
          <p className="text-white/40 font-sans text-xs uppercase tracking-widest mb-2">
            {chunkIndex === 0 ? 'Preparing your chapter' : `Preparing section ${chunkIndex + 1} of ${totalChunks}`}
          </p>
          <p className="text-white font-serif text-2xl leading-snug">{chapter.title}</p>
          <p className="text-white/50 font-sans text-sm mt-1">{book.title}</p>
        </div>

        {/* Progress pill */}
        <div className="px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm">
          <p className="text-white/60 font-sans text-xs">
            {chunkIndex === 0 ? 'Transcribing audio…' : `Buffering text…`}
          </p>
        </div>
      </div>
    </div>
  );
}
