/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'framer-motion';

import { formatTime } from '../lib/formatTime.js';

interface BufferIndicatorProps {
  isIdle: boolean;
  bufferedSeconds: number;
  isTranscribing: boolean;
}

export function BufferIndicator({ isIdle, bufferedSeconds }: Omit<BufferIndicatorProps, 'isTranscribing'>) {
  const isTranscribing = bufferedSeconds === 0;
  return (
    <motion.div
      className="absolute bottom-40 z-20"
      animate={isIdle ? 'hidden' : 'visible'}
      variants={{
        hidden: { y: '50%', opacity: 0 },
        visible: { y: '0%', opacity: 1 },
      }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
            <div className="px-3 py-1 text-xs text-white/80 bg-white/10 rounded-full backdrop-blur-sm flex items-center gap-1.5">
        {isTranscribing && (
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-orange-400"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
          />
        )}
        {bufferedSeconds > 0
          ? `Text buffered: ${formatTime(bufferedSeconds)}`
          : isTranscribing ? 'Preparing text…' : 'Ready'}
      </div>
    </motion.div>
  );
}
