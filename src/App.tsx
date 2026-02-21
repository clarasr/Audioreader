/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BufferIndicator } from './components/BufferIndicator';
import { PlayerControls } from './components/PlayerControls';
import { PlayerHeader } from './components/PlayerHeader';
import { ReadingView } from './components/ReadingView';

// Mock data for the audiobook
const mockBook = {
  title: 'The Great Gatsby',
  author: 'F. Scott Fitzgerald',
  coverArt: 'https://picsum.photos/seed/1/1080/1920',
  chapters: [
    {
      title: 'Chapter 1',
      duration: 1800, // in seconds
    },
  ],
};

// Mock text content for a chapter
const mockChapterText = [
  'In my younger and more vulnerable years my father gave me some advice that I’ve been turning over in my mind ever since.',
  '“Whenever you feel like criticizing any one,” he told me, “just remember that all the people in this world haven’t had the advantages that you’ve had.”',
  'He didn’t say any more, but we’ve always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that.',
  'In consequence, I’m inclined to reserve all judgements, a habit that has opened up many curious natures to me and also made me the victim of not a few veteran bores.',
  'The abnormal mind is quick to detect and attach itself to this quality when it appears in a normal person, and so it came about that in college I was unjustly accused of being a politician, because I was privy to the secret griefs of wild, unknown men.',
  'Most of the confidences were unsought—frequently I have feigned sleep, preoccupation, or a hostile levity when I realized by some unmistakable sign that an intimate revelation was quivering on the horizon; for the intimate revelations of young men, or at least the terms in which they express them, are usually plagiaristic and marred by obvious suppressions.',
  'Reserving judgements is a matter of infinite hope.',
  'I am still a little afraid of missing something if I forget that, as my father snobbishly suggested, and I snobbishly repeat, a sense of the fundamental decencies is parcelled out unequally at birth.',
];

export default function App() {
  return (
    <div className="w-full h-screen bg-black font-sans overflow-hidden">
      <PlayerScreen />
    </div>
  );
}



function PlayerScreen() {
  const [currentSentence, setCurrentSentence] = useState(1);
  const [isIdle, setIsIdle] = useState(false);
  const idleTimer = useRef<NodeJS.Timeout | null>(null);

  const resetIdleTimer = () => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
    }
    setIsIdle(false);
    idleTimer.current = setTimeout(() => {
      setIsIdle(true);
    }, 3000); // 3 seconds of inactivity
  };

  useEffect(() => {
    resetIdleTimer();
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('mousedown', resetIdleTimer);
    window.addEventListener('keypress', resetIdleTimer);
    window.addEventListener('scroll', resetIdleTimer);

    return () => {
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
      }
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('mousedown', resetIdleTimer);
      window.removeEventListener('keypress', resetIdleTimer);
      window.removeEventListener('scroll', resetIdleTimer);
    };
  }, []);

  return (
        <div className="relative w-full h-full max-w-lg mx-auto flex flex-col items-center justify-center" onMouseMove={resetIdleTimer}>
      {/* Background Image */}
      <div className="absolute inset-0 w-full h-full z-0">
        <img
          src={mockBook.coverArt}
          alt={`${mockBook.title} cover art`}
          className="w-full h-full object-cover blur-2xl scale-110"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-black/60"></div>
      </div>

            <PlayerHeader chapterTitle={mockBook.chapters[0].title} onBack={() => {}} isIdle={isIdle} />

                  <main className="w-full flex-grow flex flex-col justify-center items-center pt-20 pb-48 overflow-hidden">
                <ReadingView sentences={mockChapterText} currentSentenceIndex={currentSentence} isIdle={isIdle} />
      </main>

      <BufferIndicator isIdle={isIdle} />
            <PlayerControls isIdle={isIdle} />
    </div>
  );
}

