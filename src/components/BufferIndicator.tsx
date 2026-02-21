/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'framer-motion';

interface BufferIndicatorProps {
  isIdle: boolean;
}

export function BufferIndicator({ isIdle }: BufferIndicatorProps) {
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
      <div className="px-3 py-1 text-xs text-white/80 bg-white/10 rounded-full backdrop-blur-sm">
        Text buffered: 1m
      </div>
    </motion.div>
  );
}
