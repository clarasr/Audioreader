// src/components/ReadingView.tsx
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TimestampedSentence } from '../types/index.js';

interface ReadingViewProps {
  sentences: TimestampedSentence[];
  currentSentenceIndex: number;
  isIdle: boolean;
  onJumpToSentence: (index: number) => void;
}

export function ReadingView({ sentences, currentSentenceIndex, isIdle, onJumpToSentence }: ReadingViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const activeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => { if (isIdle) setIsExpanded(false); }, [isIdle]);

  // Auto-scroll to active sentence in expanded mode
  useEffect(() => {
    if (isExpanded && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentSentenceIndex, isExpanded]);

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  const prev = sentences[currentSentenceIndex - 1];
  const current = sentences[currentSentenceIndex];
  const next = sentences[currentSentenceIndex + 1];

  return (
    <div
      className="relative z-10 w-full flex-grow flex items-center justify-center px-4 font-serif cursor-pointer"
      onClick={toggleExpanded}
    >
      <AnimatePresence mode="wait">
        {isExpanded ? (
          <motion.div
            key="expanded"
            className="w-full h-full overflow-y-auto text-left py-4 px-2 space-y-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          >
            {sentences.map((sentence, index) => (
              <p
                key={index}
                ref={index === currentSentenceIndex ? activeRef : null}
                className={`text-xl leading-relaxed cursor-pointer transition-colors duration-300 ${
                  index === currentSentenceIndex
                    ? 'text-white'
                    : index < currentSentenceIndex
                    ? 'text-white/30'
                    : 'text-white/60'
                }`}
                onClick={(e) => { e.stopPropagation(); onJumpToSentence(index); }}
              >
                {sentence.text}
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
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          >
            <AnimatePresence mode="popLayout">
              {prev && (
                <motion.p
                  key={`prev-${currentSentenceIndex}`}
                  className="text-2xl leading-relaxed opacity-40 mb-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.4 }}
                  exit={{ opacity: 0 }}
                >
                  {prev.text}
                </motion.p>
              )}
              {current && (
                <motion.p
                  key={`cur-${currentSentenceIndex}`}
                  className="text-4xl leading-snug text-white font-semibold"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.35 }}
                >
                  {current.text}
                </motion.p>
              )}
              {next && (
                <motion.p
                  key={`next-${currentSentenceIndex}`}
                  className="text-2xl leading-relaxed opacity-40 mt-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.4 }}
                  exit={{ opacity: 0 }}
                >
                  {next.text}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
