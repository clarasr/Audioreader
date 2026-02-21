// src/screens/SettingsScreen.tsx
import { useState, useEffect } from 'react';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface StorageRow { book_id: string; chunk_count: number; approx_bytes: number; }

interface Props { onBack: () => void; }

export function SettingsScreen({ onBack }: Props) {
  const [storage, setStorage] = useState<StorageRow[]>([]);

  useEffect(() => {
    fetch('/api/storage').then(r => r.json()).then(setStorage).catch(() => {});
  }, []);

  const clearCache = async (bookId: string) => {
    await fetch(`/api/books/${bookId}`, { method: 'DELETE' });
    setStorage(prev => prev.filter(r => r.book_id !== bookId));
  };

  return (
    <div className="w-full min-h-screen bg-background text-white pb-24">
      <div className="px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 text-white/60"><ChevronLeft size={22} /></button>
        <h1 className="font-serif text-2xl">Settings</h1>
      </div>

      <div className="px-4 space-y-6">
        <section>
          <h2 className="font-sans text-xs uppercase tracking-widest text-white/40 mb-3">Transcription Cache</h2>
          {storage.length === 0 ? (
            <p className="text-white/30 font-sans text-sm">No cached transcriptions</p>
          ) : (
            <div className="space-y-2">
              {storage.map(row => (
                <div key={row.book_id} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                  <div>
                    <p className="font-sans text-sm text-white/80 font-mono">{row.book_id}</p>
                    <p className="font-sans text-xs text-white/30">
                      {row.chunk_count} chunks · {(row.approx_bytes / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    className="p-2 text-white/30 hover:text-red-400 transition-colors"
                    onClick={() => clearCache(row.book_id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
