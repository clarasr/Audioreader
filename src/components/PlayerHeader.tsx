// src/components/PlayerHeader.tsx
import { ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';

interface PlayerHeaderProps {
  bookTitle: string;
  chapterTitle: string;
  onBack: () => void;
  isIdle: boolean;
}

export function PlayerHeader({ bookTitle, chapterTitle, onBack, isIdle }: PlayerHeaderProps) {
  return (
    <motion.header
      className="absolute top-0 left-0 right-0 z-20 p-4 bg-black/10 backdrop-blur-sm"
      animate={isIdle ? 'hidden' : 'visible'}
      variants={{ hidden: { y: '-100%', opacity: 0 }, visible: { y: '0%', opacity: 1 } }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      <div className="max-w-lg mx-auto flex items-center justify-between text-white">
        <button onClick={onBack} className="p-2">
          <ChevronLeft size={24} />
        </button>
        <div className="text-center flex-1 mx-4 truncate">
          <h2 className="font-serif text-base truncate">{chapterTitle}</h2>
          <p className="font-sans text-xs text-white/50 truncate">{bookTitle}</p>
        </div>
        <div className="w-10" />
      </div>
    </motion.header>
  );
}
