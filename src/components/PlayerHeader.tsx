/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';

interface PlayerHeaderProps {
  chapterTitle: string;
  onBack: () => void;
  isIdle: boolean;
}

export function PlayerHeader({ chapterTitle, onBack, isIdle }: PlayerHeaderProps) {
  return (
    <motion.header 
      className="absolute top-0 left-0 right-0 z-20 p-4 bg-black/10 backdrop-blur-sm"
      animate={isIdle ? 'hidden' : 'visible'}
      variants={{
        hidden: { y: '-100%', opacity: 0 },
        visible: { y: '0%', opacity: 1 },
      }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      <div className="max-w-lg mx-auto flex items-center justify-between text-white">
        <button onClick={onBack} className="p-2">
          <ChevronLeft size={24} />
        </button>
        <h2 className="font-serif text-lg truncate">{chapterTitle}</h2>
        <div className="w-10"></div> {/* Spacer */}
      </div>
    </motion.header>
  );
}
