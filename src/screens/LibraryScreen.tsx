// src/screens/LibraryScreen.tsx
import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus } from 'lucide-react';
import { BookCard } from '../components/BookCard.js';
import { formatTime } from '../lib/formatTime.js';
import type { Book } from '../types/index.js';

interface Props {
  books: Book[];
  loading: boolean;
  onOpenBook: (book: Book) => void;
  onAddBook: (file: File) => Promise<void>;
}

export function LibraryScreen({ books, loading, onOpenBook, onAddBook }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await onAddBook(file);
    e.target.value = '';
  };

  const continueListening = books.filter(b => b.lastPositionSeconds && b.lastPositionSeconds > 0);
  const totalBytes = books.reduce((acc, b) => acc + b.fileSizeBytes, 0);

  return (
    <div className="w-full min-h-screen bg-background text-white overflow-y-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm px-4 pt-12 pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl">Library</h1>
          <p className="font-sans text-xs text-white/30 mt-0.5">
            {books.length} book{books.length !== 1 ? 's' : ''} · {(totalBytes / 1e9).toFixed(1)} GB
          </p>
        </div>
        <button className="p-2 text-white/50 hover:text-white"><Search size={20} /></button>
      </div>

      <div className="px-4 space-y-8">
        {/* Continue Listening */}
        {continueListening.length > 0 && (
          <section>
            <h2 className="font-sans text-xs uppercase tracking-widest text-white/40 mb-3">Continue Listening</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {continueListening.map(book => (
                <div key={book.id} className="flex-shrink-0 w-36">
                  <BookCard book={book} onClick={() => onOpenBook(book)} compact />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Your Books */}
        <section>
          <h2 className="font-sans text-xs uppercase tracking-widest text-white/40 mb-3">Your Books</h2>
          {loading ? (
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="aspect-[2/3] rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : books.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-center">
              <p className="font-serif text-white/30 text-xl">No audiobooks yet</p>
              <p className="font-sans text-white/20 text-sm">Add your first book to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {books.map(book => (
                <BookCard key={book.id} book={book} onClick={() => onOpenBook(book)} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Add button */}
      <motion.button
        className="fixed bottom-6 right-6 w-14 h-14 bg-white text-black rounded-full shadow-xl flex items-center justify-center z-20"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => fileInputRef.current?.click()}
      >
        <Plus size={24} />
      </motion.button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.m4b,.m4a,.ogg,audio/*"
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  );
}
