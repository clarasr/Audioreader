// src/hooks/useLibrary.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { parseAudioFile } from '../lib/audioMetadata.js';
import type { Book } from '../types/index.js';

export function useLibrary() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const fileMap = useRef<Map<string, File>>(new Map());

  useEffect(() => {
    fetch('/api/books')
      .then(r => r.json())
      .then((data: Book[]) => { setBooks(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const addBook = useCallback(async (file: File): Promise<Book> => {
    const book = await parseAudioFile(file);
    await fetch('/api/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(book),
    });
    fileMap.current.set(book.id, file);
    setBooks(prev => {
      const exists = prev.find(b => b.id === book.id);
      return exists ? prev : [book, ...prev];
    });
    return book;
  }, []);

  const getFile = useCallback((bookId: string): File | undefined => {
    return fileMap.current.get(bookId);
  }, []);

  const removeBook = useCallback(async (bookId: string) => {
    await fetch(`/api/books/${bookId}`, { method: 'DELETE' });
    fileMap.current.delete(bookId);
    setBooks(prev => prev.filter(b => b.id !== bookId));
  }, []);

  const updateProgress = useCallback((bookId: string, chapterIndex: number, positionSeconds: number) => {
    fetch(`/api/books/${bookId}/progress`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterIndex, positionSeconds }),
    }).catch(() => {});
    setBooks(prev => prev.map(b =>
      b.id === bookId ? { ...b, lastChapterIndex: chapterIndex, lastPositionSeconds: positionSeconds, lastOpenedAt: Date.now() } : b
    ));
  }, []);

  return { books, loading, addBook, getFile, removeBook, updateProgress };
}
