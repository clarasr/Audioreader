/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Play, Pause, Rewind, FastForward, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatTime } from '../lib/formatTime.js';

const SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

import { MoreHorizontal } from 'lucide-react';

interface PlayerControlsProps {
  isIdle: boolean;
  isPlaying: boolean;
  currentPositionSeconds: number;
  chapterDurationSeconds: number;
  playbackRate: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (seconds: number) => void;
  onSkipForward: () => void;
  onSkipBackward: () => void;
  onSetPlaybackRate: (rate: number) => void;
  onOpenOverlay: () => void;
}

export function PlayerControls({
  isIdle, isPlaying, currentPositionSeconds, chapterDurationSeconds,
  playbackRate, onPlay, onPause, onSeek, onSkipForward, onSkipBackward, onSetPlaybackRate,
  onOpenOverlay
}: PlayerControlsProps) {
  const progress = chapterDurationSeconds > 0
    ? (currentPositionSeconds / chapterDurationSeconds) * 100
    : 0;

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(playbackRate);
    onSetPlaybackRate(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(ratio * chapterDurationSeconds);
  };
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
            <div className="max-w-lg mx-auto bg-black/30 backdrop-blur-lg rounded-2xl p-4 text-white">
        {/* Progress bar */}
        <div
          className="w-full h-1.5 bg-white/20 rounded-full mb-2 cursor-pointer"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-white rounded-full transition-all duration-100"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        {/* Time */}
        <div className="flex justify-between text-xs text-white/50 mb-4 font-sans">
          <span>{formatTime(currentPositionSeconds)}</span>
          <span>-{formatTime(chapterDurationSeconds - currentPositionSeconds)}</span>
        </div>

        {/* Main controls */}
        <div className="flex items-center justify-center space-x-6">
          <button className="p-2 text-white/70 hover:text-white transition-colors" onClick={onSkipBackward}>
            <Rewind size={24} />
          </button>
          <button
            className="p-4 bg-white text-black rounded-full shadow-lg hover:bg-white/90 transition-colors"
            onClick={isPlaying ? onPause : onPlay}
          >
            {isPlaying ? <Pause size={28} /> : <Play size={28} />}
          </button>
          <button className="p-2 text-white/70 hover:text-white transition-colors" onClick={onSkipForward}>
            <FastForward size={24} />
          </button>
        </div>

        {/* Speed */}
        <div className="flex items-center justify-between mt-3 text-xs text-white/50 font-sans">
          <button className="p-2 flex items-center space-x-1 hover:text-white transition-colors" onClick={cycleSpeed}>
            <Zap size={14} />
            <span>{playbackRate}x</span>
          </button>

          <button className="p-2 hover:text-white transition-colors" onClick={onOpenOverlay}>
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>
    </motion.footer>
  );
}
