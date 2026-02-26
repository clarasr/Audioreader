import { useRef, useState } from 'react';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
}

const ACCEPTED_EXTENSIONS = [
  '.mp3', '.m4b', '.m4a', '.aac', '.ogg', '.flac', '.opus', '.wav',
];

export default function UploadZone({ onFileSelect }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (ACCEPTED_EXTENSIONS.includes(ext) || file.type.startsWith('audio/')) {
      onFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  return (
    <div
      className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer select-none transition-all duration-200 ${
        isDragging
          ? 'border-indigo-400 bg-indigo-950/40 scale-[1.01]'
          : 'border-gray-700 hover:border-indigo-500 hover:bg-gray-900/60'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center gap-5">
        <div
          className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-colors ${
            isDragging ? 'bg-indigo-800/60' : 'bg-gray-800'
          }`}
        >
          <svg
            className={`w-10 h-10 transition-colors ${
              isDragging ? 'text-indigo-300' : 'text-indigo-500'
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
          </svg>
        </div>

        <div>
          <p className="text-xl font-semibold text-white">
            {isDragging ? 'Drop it here' : 'Drop your audiobook here'}
          </p>
          <p className="text-sm text-gray-500 mt-2">or click to browse files</p>
        </div>

        <p className="text-xs text-gray-600 bg-gray-900 px-3 py-1.5 rounded-full">
          MP3 · M4B · M4A · AAC · OGG · FLAC · WAV
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.m4b"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
