// src/screens/UploadScreen.tsx
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Upload } from 'lucide-react';
import { parseAudioFile } from '../lib/audioMetadata.js';
import type { Book } from '../types/index.js';

interface Props {
  onBookReady: (book: Book, file: File) => void;
}

export function UploadScreen({ onBookReady }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|m4b|m4a|ogg|flac)$/i)) {
      setError('Please upload an audio file (MP3, M4B, M4A)');
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      // Upload the file first
      const formData = new FormData();
      formData.append('audioFile', file);

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      const uploadResult = await uploadResponse.json();
      const filePath = uploadResult.filePath;

      // Now parse metadata and add the file path
      const book = await parseAudioFile(file);
      const bookWithFilePath = { ...book, filePath };

      // Persist to backend
      await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookWithFilePath),
      });
      onBookReady(bookWithFilePath, file);
    } catch (e) {
      setError(`Failed to read file: ${String(e)}`);
      setIsProcessing(false);
    }
  }, [onBookReady]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="w-full h-screen bg-background flex flex-col items-center justify-center p-8">
      <motion.div
        className={`w-full max-w-md rounded-3xl border-2 border-dashed p-12 flex flex-col items-center gap-6 cursor-pointer transition-colors ${
          isDragging ? 'border-white/60 bg-white/10' : 'border-white/20 bg-white/5'
        }`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => document.getElementById('file-input')?.click()}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <input
          id="file-input"
          type="file"
          accept=".mp3,.m4b,.m4a,.ogg,.flac,audio/*"
          className="hidden"
          onChange={onFileInput}
        />

        {isProcessing ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
              className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white"
            />
            <p className="text-white/60 font-sans text-sm">Reading chapters…</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
              {isDragging ? <Upload size={28} className="text-white" /> : <BookOpen size={28} className="text-white/60" />}
            </div>
            <div className="text-center">
              <p className="text-white font-serif text-xl mb-1">Drop an audiobook</p>
              <p className="text-white/40 font-sans text-sm">MP3, M4B, M4A supported</p>
            </div>
          </>
        )}
      </motion.div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 text-red-400 text-sm font-sans"
        >
          {error}
        </motion.p>
      )}
    </div>
  );
}
