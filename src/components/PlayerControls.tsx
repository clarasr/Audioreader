/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Play, Pause, SkipBack, SkipForward, Rewind, FastForward, Timer, Zap
} from 'lucide-react';
import { motion } from 'framer-motion';

interface PlayerControlsProps {
  isIdle: boolean;
}

export function PlayerControls({ isIdle }: PlayerControlsProps) {
  return (
    <motion.footer 
      className="absolute bottom-0 left-0 right-0 z-20 p-4"
      animate={isIdle ? 'hidden' : 'visible'}
      variants={{
        hidden: { y: '100%', opacity: 0 },
        visible: { y: '0%', opacity: 1 },
      }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      <div className="max-w-lg mx-auto bg-black/20 backdrop-blur-lg rounded-2xl p-4 text-white">
        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-white/20 rounded-full mb-4 cursor-pointer">
          <div className="w-1/4 h-full bg-white rounded-full"></div>
        </div>

        {/* Main Controls */}
        <div className="flex items-center justify-center space-x-6">
          <button className="p-2 text-white/70 hover:text-white transition-colors"><Rewind size={24} /></button>
          <button className="p-2 text-white/70 hover:text-white transition-colors"><SkipBack size={24} /></button>
          <button className="p-4 bg-white text-black rounded-full shadow-lg">
            <Play size={32} />
          </button>
          <button className="p-2 text-white/70 hover:text-white transition-colors"><SkipForward size={24} /></button>
          <button className="p-2 text-white/70 hover:text-white transition-colors"><FastForward size={24} /></button>
        </div>

        {/* Bottom Controls */}
        <div className="flex items-center justify-between mt-4 text-xs text-white/70">
          <button className="p-2 flex items-center space-x-1 hover:text-white transition-colors">
            <Zap size={16} />
            <span>1.0x</span>
          </button>
          <button className="p-2 hover:text-white transition-colors">
            <Timer size={16} />
          </button>
        </div>
      </div>
    </motion.footer>
  );
}
