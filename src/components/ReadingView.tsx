/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReadingViewProps {
  sentences: string[];
  currentSentenceIndex: number;
  isIdle: boolean;
}

export function ReadingView({ sentences, currentSentenceIndex, isIdle }: ReadingViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isIdle) {
      setIsExpanded(false);
    }
  }, [isIdle]);

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  return (
    <div 
      className="relative z-10 w-full flex-grow flex items-center justify-center px-4 font-serif cursor-pointer"
      onClick={toggleExpanded}
    >
      <AnimatePresence mode="wait">
        {isExpanded ? (
          <motion.div
            key="expanded"
            ref={scrollRef}
            className="w-full h-full overflow-y-auto text-left py-4 px-2 space-y-6 text-xl leading-relaxed text-white/80"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            {sentences.map((sentence, index) => (
              <p key={index} className={`${index === currentSentenceIndex ? 'text-white' : ''}`}>
                {sentence}
              </p>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="focused"
            className="text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <p className="text-2xl leading-relaxed opacity-50">
              {sentences[currentSentenceIndex - 1]}
            </p>
            <p className="my-8 text-4xl leading-snug text-white">
              {sentences[currentSentenceIndex]}
            </p>
            <p className="text-2xl leading-relaxed opacity-50">
              {sentences[currentSentenceIndex + 1]}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
