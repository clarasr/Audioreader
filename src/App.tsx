/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useCallback } from 'react';
import { useLibrary } from './hooks/useLibrary.js';
import { LibraryScreen } from './screens/LibraryScreen.js';
import { BookDetailScreen } from './screens/BookDetailScreen.js';
import { PlayerScreen } from './screens/PlayerScreen.js';
import type { Screen, Book } from './types/index.js';

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'library' });
  const { books, loading, addBook, getFile } = useLibrary();

  const handleAddBook = useCallback(async (file: File) => {
    const book = await addBook(file);
    setScreen({ name: 'bookDetail', book });
  }, [addBook]);

  const handleOpenBook = useCallback((book: Book) => {
    setScreen({ name: 'bookDetail', book });
  }, []);

  const handlePlayChapter = useCallback((book: Book, chapterIndex: number, startPositionSeconds = 0) => {
    const file = getFile(book.id);
    if (!file) {
      // Book was loaded from DB but file isn't in memory — need to re-upload
      alert('Please re-open the audio file to start playback. Audio files are not stored on the server.');
      return;
    }
    setScreen({ name: 'player', book, chapterIndex, startPositionSeconds });
  }, [getFile]);

  switch (screen.name) {
    case 'library':
      return (
        <LibraryScreen
          books={books}
          loading={loading}
          onOpenBook={handleOpenBook}
          onAddBook={handleAddBook}
        />
      );

    case 'bookDetail':
      return (
        <BookDetailScreen
          book={screen.book}
          onBack={() => setScreen({ name: 'library' })}
          onPlayChapter={(chapterIndex, startPos) =>
            handlePlayChapter(screen.book, chapterIndex, startPos)
          }
        />
      );

    case 'player': {
      const file = getFile(screen.book.id);
      if (!file) {
        setScreen({ name: 'bookDetail', book: screen.book });
        return null;
      }
      return (
        <PlayerScreen
          book={screen.book}
          chapterIndex={screen.chapterIndex}
          startPositionSeconds={screen.startPositionSeconds}
          file={file}
          onBack={() => setScreen({ name: 'bookDetail', book: screen.book })}
        />
      );
    }

    case 'settings':
      return (
        <div className="w-full h-screen bg-background text-white flex items-center justify-center font-sans">
          Settings (Phase 6)
        </div>
      );
  }
}

