import { useState, useCallback } from 'react';
import { BookMetadata } from './types';
import { parseAudioBook } from './utils/metadata';
import { uploadAudioFile } from './api/upload';
import UploadZone from './components/UploadZone';
import BookView from './components/BookView';

export default function App() {
  const [book, setBook] = useState<BookMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      setUploadPercent(null);

      if (book) {
        if (book.coverUrl) URL.revokeObjectURL(book.coverUrl);
        URL.revokeObjectURL(book.fileUrl);
      }

      try {
        // Parse metadata and upload to server in parallel
        const [metadata, fileId] = await Promise.all([
          parseAudioBook(file),
          uploadAudioFile(file, setUploadPercent),
        ]);
        setBook({ ...metadata, fileId });
      } catch (err) {
        console.error(err);
        if (err instanceof Error && err.message.includes('upload')) {
          setError('Could not upload the file to the server. Make sure the server is running.');
        } else {
          setError('Could not read this audio file. Please try a different file.');
        }
      } finally {
        setLoading(false);
        setUploadPercent(null);
      }
    },
    [book]
  );

  const handleReset = useCallback(() => {
    if (book) {
      if (book.coverUrl) URL.revokeObjectURL(book.coverUrl);
      URL.revokeObjectURL(book.fileUrl);
    }
    setBook(null);
    setError(null);
  }, [book]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-center w-72">
          <div className="w-10 h-10 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          {uploadPercent === null ? (
            <p className="text-gray-400 text-sm">Reading metadata…</p>
          ) : (
            <>
              <p className="text-gray-400 text-sm mb-3">
                Uploading… {uploadPercent}%
              </p>
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-200"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (book) {
    return <BookView book={book} onBack={handleReset} />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 p-8">
      <div className="mb-2 flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">AudioReader</h1>
      </div>
      <p className="text-gray-500 text-sm mb-10">
        Upload an audiobook to browse its chapters
      </p>

      {error && (
        <div className="mb-6 w-full max-w-lg px-4 py-3 bg-red-950/50 border border-red-800 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      <UploadZone onFileSelect={handleFileSelect} />
    </div>
  );
}
