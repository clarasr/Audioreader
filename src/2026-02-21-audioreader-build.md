# Audioreader Full Build Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Audioreader UI shell into a working audiobook player that uploads M4B/MP3 files, chunks audio into 90-second segments, transcribes via Gemini, and displays synchronized highlighted text as audio plays.

**Architecture:** Browser handles file upload, chapter metadata parsing (music-metadata-browser), and audio playback (HTML5 Audio). Audio chunks (Blob.slice ~90s) are sent to an Express backend which calls Gemini, parses timestamped sentences, caches results in SQLite, and returns them to the frontend. A requestAnimationFrame loop in usePlayback.ts binary-searches timestamps to highlight the current sentence. In production, Express serves the Vite-built frontend directly (single Cloud Run container, single URL).

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind v4 + Framer Motion · Express + better-sqlite3 · @google/genai (gemini-2.0-flash) · music-metadata-browser · lucide-react

---

## Phase 1 — Infrastructure

---

### Task 1: Install new dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install runtime deps**
```bash
cd /Users/clarasantos/Downloads/Audioreader
npm install cors music-metadata-browser concurrently
```
Expected: adds 3 packages, no errors.

**Step 2: Install dev deps**
```bash
npm install --save-dev @types/cors
```

**Step 3: Verify**
```bash
node -e "require('cors'); console.log('cors ok')"
```
Expected: `cors ok`

**Step 4: Commit**
```bash
git add package.json package-lock.json
git commit -m "chore: add cors, music-metadata-browser, concurrently deps"
```

---

### Task 2: Create shared TypeScript types

**Files:**
- Create: `src/types/index.ts`

**Step 1: Create the file**
```typescript
// src/types/index.ts

export interface Chapter {
  index: number;
  title: string;
  startMs: number;
  durationMs: number;
  startSeconds: number;
  durationSeconds: number;
}

export interface Book {
  id: string; // 16-char hex fingerprint of first 64KB
  title: string;
  author: string;
  coverArtDataUrl: string | null;
  totalDurationMs: number;
  fileSizeBytes: number;
  mimeType: string;
  chapters: Chapter[];
  lastOpenedAt?: number;
  lastChapterIndex?: number;
  lastPositionSeconds?: number;
}

export interface TimestampedSentence {
  timeSeconds: number; // relative to chapter start
  text: string;
}

export interface ChunkTranscription {
  bookId: string;
  chapterIndex: number;
  chunkIndex: number;
  chunkStartSeconds: number;
  sentences: TimestampedSentence[];
}

export type PlaybackStatus = 'idle' | 'loading' | 'buffering' | 'playing' | 'paused' | 'error';

export interface PlaybackState {
  status: PlaybackStatus;
  currentBook: Book | null;
  currentChapterIndex: number;
  currentPositionSeconds: number;
  playbackRate: number;
  sentences: TimestampedSentence[];
  currentSentenceIndex: number;
  bufferedSeconds: number;
  transcriptionError: string | null;
}

export type ChunkStatus = 'pending' | 'transcribing' | 'ready' | 'error';

export interface ChunkQueueItem {
  chunkIndex: number;
  chunkStartSeconds: number;
  status: ChunkStatus;
  transcription?: ChunkTranscription;
  error?: string;
}

export interface TranscribeRequest {
  audioBase64: string;
  mimeType: string;
  bookId: string;
  chapterIndex: number;
  chunkIndex: number;
  chunkStartSeconds: number;
  chunkDurationSeconds: number;
}

export interface TranscribeResponse {
  sentences: TimestampedSentence[];
  fromCache: boolean;
}

export type Screen =
  | { name: 'library' }
  | { name: 'bookDetail'; book: Book }
  | { name: 'player'; book: Book; chapterIndex: number; startPositionSeconds: number }
  | { name: 'settings' };
```

**Step 2: Verify TypeScript compiles**
```bash
npm run lint
```
Expected: no errors.

**Step 3: Commit**
```bash
git add src/types/index.ts
git commit -m "feat: add shared TypeScript types"
```

---

### Task 3: Create Express backend server

**Files:**
- Create: `server/index.ts`
- Create: `server/tsconfig.json`
- Create: `data/.gitkeep`

**Step 1: Create server tsconfig**
```json
// server/tsconfig.json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": false,
    "outDir": "../dist-server",
    "types": ["node"]
  },
  "include": ["./**/*.ts", "../src/types/index.ts"]
}
```

**Step 2: Create data directory**
```bash
mkdir -p /Users/clarasantos/Downloads/Audioreader/data
touch /Users/clarasantos/Downloads/Audioreader/data/.gitkeep
```

**Step 3: Add data/*.db to .gitignore**
Add this line to `.gitignore`:
```
data/*.db
dist-server/
```

**Step 4: Create server/index.ts**
```typescript
// server/index.ts
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import type { TranscribeRequest, TranscribeResponse, TimestampedSentence } from '../src/types/index.js';

dotenv.config({ path: '.env.local' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.SERVER_PORT ?? 3001;
const DB_PATH = path.join(__dirname, '../data/audioreader.db');
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Database ─────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    cover_art_data_url TEXT,
    total_duration_ms INTEGER NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    chapters_json TEXT NOT NULL,
    last_opened_at INTEGER,
    last_chapter_index INTEGER,
    last_position_seconds REAL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS transcriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id TEXT NOT NULL,
    chapter_index INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_start_seconds REAL NOT NULL,
    chunk_duration_seconds REAL NOT NULL,
    sentences_json TEXT NOT NULL,
    cached_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    UNIQUE(book_id, chapter_index, chunk_index)
  );

  CREATE INDEX IF NOT EXISTS idx_transcriptions_lookup
    ON transcriptions(book_id, chapter_index, chunk_index);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const stmts = {
  getAllBooks:     db.prepare('SELECT * FROM books ORDER BY last_opened_at DESC NULLS LAST'),
  getBook:        db.prepare('SELECT * FROM books WHERE id = ?'),
  upsertBook:     db.prepare(`
    INSERT OR REPLACE INTO books
      (id, title, author, cover_art_data_url, total_duration_ms, file_size_bytes, mime_type, chapters_json, last_opened_at, last_chapter_index, last_position_seconds)
    VALUES (@id, @title, @author, @coverArtDataUrl, @totalDurationMs, @fileSizeBytes, @mimeType, @chaptersJson, @lastOpenedAt, @lastChapterIndex, @lastPositionSeconds)
  `),
  updateProgress: db.prepare(
    'UPDATE books SET last_opened_at = @now, last_chapter_index = @chapterIndex, last_position_seconds = @positionSeconds WHERE id = @id'
  ),
  deleteBook:     db.prepare('DELETE FROM books WHERE id = ?'),
  getCached:      db.prepare(
    'SELECT sentences_json FROM transcriptions WHERE book_id = ? AND chapter_index = ? AND chunk_index = ?'
  ),
  upsertTranscription: db.prepare(`
    INSERT OR REPLACE INTO transcriptions
      (book_id, chapter_index, chunk_index, chunk_start_seconds, chunk_duration_seconds, sentences_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  deleteBookTranscriptions: db.prepare('DELETE FROM transcriptions WHERE book_id = ?'),
  storageByBook:  db.prepare(`
    SELECT book_id, COUNT(*) as chunk_count,
           SUM(LENGTH(sentences_json)) as approx_bytes
    FROM transcriptions GROUP BY book_id
  `),
};

// ── Gemini ────────────────────────────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function makePrompt(chunkStartSeconds: number): string {
  return `Transcribe the audio exactly as spoken. Return ONLY sentences with timestamps.
The audio chunk starts at ${chunkStartSeconds.toFixed(1)} seconds into the chapter.
Format each line exactly as: [MM:SS] sentence text
Rules:
- One sentence per line
- Timestamps mark the START of each sentence, relative to chapter start
- Preserve proper punctuation (add if missing)
- No commentary, headers, or labels
- Skip silent/unclear sections`;
}

function parseTranscription(raw: string): TimestampedSentence[] {
  const lines = raw.trim().split('\n');
  const results: TimestampedSentence[] = [];
  const re = /^\[(\d{1,2}):(\d{2})(?:\.(\d+))?\]\s*(.+)$/;
  for (const line of lines) {
    const m = line.trim().match(re);
    if (!m) continue;
    const timeSeconds = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseFloat(`0.${m[3]}`) : 0);
    const text = m[4].trim();
    if (text) results.push({ timeSeconds, text });
  }
  return results;
}

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: IS_PROD ? false : 'http://localhost:3000' }));
app.use(express.json({ limit: '25mb' }));

// POST /api/transcribe
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType, bookId, chapterIndex, chunkIndex,
            chunkStartSeconds, chunkDurationSeconds } = req.body as TranscribeRequest;

    // Cache check
    const cached = stmts.getCached.get(bookId, chapterIndex, chunkIndex) as { sentences_json: string } | undefined;
    if (cached) {
      const response: TranscribeResponse = { sentences: JSON.parse(cached.sentences_json), fromCache: true };
      return res.json(response);
    }

    // Call Gemini
    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          { text: makePrompt(chunkStartSeconds) },
        ],
      }],
    });

    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const sentences = parseTranscription(raw);

    stmts.upsertTranscription.run(bookId, chapterIndex, chunkIndex, chunkStartSeconds, chunkDurationSeconds, JSON.stringify(sentences));

    const response: TranscribeResponse = { sentences, fromCache: false };
    res.json(response);
  } catch (err) {
    console.error('Transcription error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/books
app.get('/api/books', (_req, res) => {
  const rows = stmts.getAllBooks.all() as any[];
  const books = rows.map(r => ({
    ...r,
    chapters: JSON.parse(r.chapters_json),
    coverArtDataUrl: r.cover_art_data_url,
    totalDurationMs: r.total_duration_ms,
    fileSizeBytes: r.file_size_bytes,
    mimeType: r.mime_type,
    lastOpenedAt: r.last_opened_at,
    lastChapterIndex: r.last_chapter_index,
    lastPositionSeconds: r.last_position_seconds,
  }));
  res.json(books);
});

// POST /api/books
app.post('/api/books', (req, res) => {
  const b = req.body;
  stmts.upsertBook.run({
    id: b.id, title: b.title, author: b.author,
    coverArtDataUrl: b.coverArtDataUrl, totalDurationMs: b.totalDurationMs,
    fileSizeBytes: b.fileSizeBytes, mimeType: b.mimeType,
    chaptersJson: JSON.stringify(b.chapters),
    lastOpenedAt: null, lastChapterIndex: null, lastPositionSeconds: null,
  });
  res.json({ success: true });
});

// PATCH /api/books/:id/progress
app.patch('/api/books/:id/progress', (req, res) => {
  const { chapterIndex, positionSeconds } = req.body;
  stmts.updateProgress.run({ now: Date.now(), chapterIndex, positionSeconds, id: req.params.id });
  res.json({ success: true });
});

// DELETE /api/books/:id
app.delete('/api/books/:id', (req, res) => {
  stmts.deleteBookTranscriptions.run(req.params.id);
  stmts.deleteBook.run(req.params.id);
  res.json({ success: true });
});

// GET /api/storage
app.get('/api/storage', (_req, res) => {
  res.json(stmts.storageByBook.all());
});

// Production: serve Vite build
if (IS_PROD) {
  const distPath = path.join(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, () => console.log(`[audioreader] server :${PORT} (${IS_PROD ? 'prod' : 'dev'})`));
```

**Step 5: Commit**
```bash
git add server/ data/.gitkeep .gitignore
git commit -m "feat: add Express + SQLite backend server"
```

---

### Task 4: Wire up npm scripts and Vite proxy

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`

**Step 1: Update package.json scripts**

Replace the `"scripts"` block with:
```json
"scripts": {
  "dev": "vite --port=3000 --host=0.0.0.0",
  "server": "tsx watch server/index.ts",
  "dev:all": "concurrently \"npm run server\" \"npm run dev\"",
  "build": "vite build",
  "start": "NODE_ENV=production node dist-server/server/index.js",
  "preview": "vite preview",
  "clean": "rm -rf dist dist-server",
  "lint": "tsc --noEmit"
}
```

**Step 2: Add Vite proxy**

In `vite.config.ts`, update the `server` block:
```typescript
server: {
  hmr: process.env.DISABLE_HMR !== 'true',
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true,
    },
  },
},
```

Also add to the `define` block (keep GEMINI_API_KEY line, just add):
```typescript
define: {
  'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
  'process.env.NODE_ENV': JSON.stringify(mode),
},
```

**Step 3: Create .env.local** (user must do this manually with real key)
```bash
# .env.local — gitignored
GEMINI_API_KEY=your_real_key_here
SERVER_PORT=3001
```

**Step 4: Verify server starts**
```bash
npm run server
```
Expected output: `[audioreader] server :3001 (dev)`
Kill with Ctrl+C.

**Step 5: Commit**
```bash
git add package.json vite.config.ts
git commit -m "feat: add dev:all script and Vite /api proxy"
```

---

## Phase 2 — Audio Upload & Metadata

---

### Task 5: Create utility — formatTime

**Files:**
- Create: `src/lib/formatTime.ts`

**Step 1: Write the file**
```typescript
// src/lib/formatTime.ts

/** Formats seconds as M:SS or H:MM:SS */
export function formatTime(totalSeconds: number): string {
  if (!isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Formats ms as M:SS */
export function formatMs(ms: number): string {
  return formatTime(ms / 1000);
}
```

**Step 2: Manual test**
```bash
node -e "
import('./src/lib/formatTime.ts').then(m => {
  console.assert(m.formatTime(0) === '0:00', 'zero');
  console.assert(m.formatTime(65) === '1:05', '65s');
  console.assert(m.formatTime(3661) === '1:01:01', '1h1m1s');
  console.log('formatTime: all ok');
})
"
```
(or just verify visually when it renders in the UI)

**Step 3: Commit**
```bash
git add src/lib/formatTime.ts
git commit -m "feat: add formatTime utility"
```

---

### Task 6: Create audio metadata parser

**Files:**
- Create: `src/lib/audioMetadata.ts`

**Step 1: Write the file**
```typescript
// src/lib/audioMetadata.ts
import * as mm from 'music-metadata-browser';
import type { Book, Chapter } from '../types/index.js';

export async function parseAudioFile(file: File): Promise<Book> {
  const metadata = await mm.parseBlob(file, { skipCovers: false });
  const { common, format } = metadata;

  const totalDurationMs = (format.duration ?? 0) * 1000;
  const rawChapters = (common as any).chapter as Array<{ title: string; startPosition: number }> | undefined;

  const chapters = normalizeChapters(rawChapters ?? [], totalDurationMs);
  const coverArtDataUrl = await extractCoverArt(common.picture?.[0]);
  const id = await computeBookId(file);

  return {
    id,
    title: common.title ?? stripExtension(file.name),
    author: common.artist ?? common.albumartist ?? 'Unknown Author',
    coverArtDataUrl,
    totalDurationMs,
    fileSizeBytes: file.size,
    mimeType: file.type || detectMimeType(file.name),
    chapters,
  };
}

function normalizeChapters(
  raw: Array<{ title: string; startPosition: number }>,
  totalDurationMs: number
): Chapter[] {
  if (raw.length === 0) {
    return [{
      index: 0,
      title: 'Full Book',
      startMs: 0,
      durationMs: totalDurationMs,
      startSeconds: 0,
      durationSeconds: totalDurationMs / 1000,
    }];
  }
  return raw.map((ch, i) => {
    const nextStart = raw[i + 1]?.startPosition ?? totalDurationMs;
    const durationMs = nextStart - ch.startPosition;
    return {
      index: i,
      title: ch.title || `Chapter ${i + 1}`,
      startMs: ch.startPosition,
      durationMs,
      startSeconds: ch.startPosition / 1000,
      durationSeconds: durationMs / 1000,
    };
  });
}

async function extractCoverArt(picture?: mm.IPicture): Promise<string | null> {
  if (!picture) return null;
  // Convert to data URL so it survives page reload (object URLs are session-only)
  return new Promise((resolve) => {
    const blob = new Blob([picture.data], { type: picture.format });
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function computeBookId(file: File): Promise<string> {
  const sample = file.slice(0, 65536);
  const buffer = await sample.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function detectMimeType(name: string): string {
  if (name.endsWith('.m4b') || name.endsWith('.m4a')) return 'audio/mp4';
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.ogg')) return 'audio/ogg';
  return 'audio/mpeg';
}
```

**Step 2: Verify TypeScript**
```bash
npm run lint
```

**Step 3: Commit**
```bash
git add src/lib/audioMetadata.ts
git commit -m "feat: add audio metadata parser (music-metadata-browser)"
```

---

### Task 7: Create audio chunker

**Files:**
- Create: `src/lib/audioChunker.ts`

**Step 1: Write the file**
```typescript
// src/lib/audioChunker.ts
import type { Book, Chapter } from '../types/index.js';

export const CHUNK_DURATION_S = 90;
const OVERLAP_S = 2; // lead-in overlap for all chunks after chunk 0

export function getChunkCount(chapter: Chapter): number {
  return Math.ceil(chapter.durationSeconds / CHUNK_DURATION_S);
}

export interface AudioChunk {
  blob: Blob;
  chunkIndex: number;
  /** Absolute time in chapter (no overlap) — used for Gemini prompt */
  startSeconds: number;
  durationSeconds: number;
}

export function sliceChunk(
  file: File,
  book: Book,
  chapter: Chapter,
  chunkIndex: number
): AudioChunk {
  const chunkStartInChapter = chunkIndex * CHUNK_DURATION_S;
  const chunkEndInChapter = Math.min(chunkStartInChapter + CHUNK_DURATION_S, chapter.durationSeconds);
  const durationSeconds = chunkEndInChapter - chunkStartInChapter;

  // Absolute time in file
  const absStart = chapter.startSeconds + chunkStartInChapter;
  const absEnd = chapter.startSeconds + chunkEndInChapter;

  // Proportional byte approximation
  const totalDurationS = book.totalDurationMs / 1000;
  const bytesPerSecond = book.fileSizeBytes / totalDurationS;

  const byteStart = Math.floor(absStart * bytesPerSecond);
  const byteEnd = Math.ceil(absEnd * bytesPerSecond);

  // Apply lead-in overlap for chunks after the first to avoid word cutoff
  const effectiveByteStart = chunkIndex === 0
    ? byteStart
    : Math.max(0, byteStart - Math.floor(OVERLAP_S * bytesPerSecond));

  return {
    blob: file.slice(effectiveByteStart, byteEnd, book.mimeType),
    chunkIndex,
    startSeconds: chapter.startSeconds + chunkStartInChapter,
    durationSeconds,
  };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data:mime;base64,
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
```

**Step 2: Verify TypeScript**
```bash
npm run lint
```

**Step 3: Commit**
```bash
git add src/lib/audioChunker.ts
git commit -m "feat: add audio chunker (Blob.slice proportional byte offset)"
```

---

### Task 8: Refactor App.tsx to screen router + create UploadScreen

**Files:**
- Modify: `src/App.tsx`
- Create: `src/screens/UploadScreen.tsx`
- Create: `src/hooks/useIdleDetection.ts`

**Step 1: Extract idle detection hook**
```typescript
// src/hooks/useIdleDetection.ts
import { useState, useEffect, useRef } from 'react';

export function useIdleDetection(timeoutMs = 3000): boolean {
  const [isIdle, setIsIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      setIsIdle(false);
      timer.current = setTimeout(() => setIsIdle(true), timeoutMs);
    };
    reset();
    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, reset));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [timeoutMs]);

  return isIdle;
}
```

**Step 2: Create UploadScreen**
```typescript
// src/screens/UploadScreen.tsx
import { useState, useCallback } from 'react';
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
      const book = await parseAudioFile(file);
      // Persist to backend
      await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(book),
      });
      onBookReady(book, file);
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
```

**Step 3: Rewrite App.tsx with screen router**
```typescript
// src/App.tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useRef } from 'react';
import type { Screen, Book } from './types/index.js';
import { UploadScreen } from './screens/UploadScreen.js';
import { PlayerScreen } from './screens/PlayerScreen.js';

// Placeholder screens — replaced in later tasks
function LibraryScreen({ onUpload, onOpen }: { onUpload: () => void; onOpen: (book: Book) => void }) {
  return (
    <div className="w-full h-screen bg-background flex items-center justify-center">
      <button onClick={onUpload} className="text-white/60 font-sans">
        + Add audiobook
      </button>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'library' });
  const fileRef = useRef<File | null>(null);

  const handleBookReady = (book: Book, file: File) => {
    fileRef.current = file;
    setScreen({ name: 'bookDetail', book });
  };

  switch (screen.name) {
    case 'library':
      return (
        <LibraryScreen
          onUpload={() => setScreen({ name: 'library' })}
          onOpen={(book) => setScreen({ name: 'bookDetail', book })}
        />
      );

    case 'bookDetail':
      // Placeholder — replaced in Task 21
      return (
        <UploadScreen onBookReady={handleBookReady} />
      );

    case 'player':
      return (
        <PlayerScreen
          book={screen.book}
          chapterIndex={screen.chapterIndex}
          startPositionSeconds={screen.startPositionSeconds}
          file={fileRef.current!}
          onBack={() => setScreen({ name: 'bookDetail', book: screen.book })}
        />
      );

    case 'settings':
      return <div className="w-full h-screen bg-background text-white flex items-center justify-center">Settings (coming soon)</div>;
  }
}
```

Note: `PlayerScreen` is the refactored version of the existing component — it's renamed/moved in Task 16.

**Step 4: Verify app still starts**
```bash
npm run dev
```
Open http://localhost:3000 — should show an upload drop zone.

**Step 5: Commit**
```bash
git add src/App.tsx src/screens/UploadScreen.tsx src/hooks/useIdleDetection.ts
git commit -m "feat: screen router + upload screen with file parsing"
```

---

## Phase 3 — Transcription Pipeline

---

### Task 9: Create transcription API client

**Files:**
- Create: `src/lib/transcriptionClient.ts`

**Step 1: Write the file**
```typescript
// src/lib/transcriptionClient.ts
import type { TimestampedSentence, TranscribeRequest, TranscribeResponse } from '../types/index.js';

export async function transcribeChunk(params: {
  audioBase64: string;
  mimeType: string;
  bookId: string;
  chapterIndex: number;
  chunkIndex: number;
  chunkStartSeconds: number;
  chunkDurationSeconds: number;
}): Promise<TimestampedSentence[]> {
  const payload: TranscribeRequest = params;

  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Transcription failed (${res.status}): ${text}`);
  }

  const data: TranscribeResponse = await res.json();
  return data.sentences;
}
```

**Step 2: Commit**
```bash
git add src/lib/transcriptionClient.ts
git commit -m "feat: transcription API client"
```

---

### Task 10: Create transcription queue (background prefetch)

**Files:**
- Create: `src/lib/transcriptionQueue.ts`

**Step 1: Write the file**
```typescript
// src/lib/transcriptionQueue.ts
import { sliceChunk, blobToBase64, getChunkCount, CHUNK_DURATION_S } from './audioChunker.js';
import { transcribeChunk } from './transcriptionClient.js';
import type { Book, Chapter, TimestampedSentence, ChunkQueueItem } from '../types/index.js';

type ChunkKey = string; // `${bookId}:${chapterIdx}:${chunkIdx}`

function key(bookId: string, chapterIndex: number, chunkIndex: number): ChunkKey {
  return `${bookId}:${chapterIndex}:${chunkIndex}`;
}

export class TranscriptionQueue {
  private cache = new Map<ChunkKey, TimestampedSentence[]>();
  private inflight = new Set<ChunkKey>();
  private queue: Array<() => Promise<void>> = [];
  private running = false;
  private onReadyCallbacks: Array<(bookId: string, chapterIndex: number, chunkIndex: number, sentences: TimestampedSentence[]) => void> = [];

  onReady(cb: (bookId: string, chapterIndex: number, chunkIndex: number, sentences: TimestampedSentence[]) => void) {
    this.onReadyCallbacks.push(cb);
    return () => { this.onReadyCallbacks = this.onReadyCallbacks.filter(f => f !== cb); };
  }

  get(bookId: string, chapterIndex: number, chunkIndex: number): TimestampedSentence[] | undefined {
    return this.cache.get(key(bookId, chapterIndex, chunkIndex));
  }

  isReady(bookId: string, chapterIndex: number, chunkIndex: number): boolean {
    return this.cache.has(key(bookId, chapterIndex, chunkIndex));
  }

  /** Fetch a chunk, waiting for the result (used for chunk 0 before playback starts) */
  async fetchNow(file: File, book: Book, chapter: Chapter, chunkIndex: number): Promise<TimestampedSentence[]> {
    const k = key(book.id, chapter.index, chunkIndex);
    if (this.cache.has(k)) return this.cache.get(k)!;

    const chunk = sliceChunk(file, book, chapter, chunkIndex);
    const audioBase64 = await blobToBase64(chunk.blob);
    const sentences = await transcribeChunk({
      audioBase64,
      mimeType: book.mimeType,
      bookId: book.id,
      chapterIndex: chapter.index,
      chunkIndex,
      chunkStartSeconds: chunk.startSeconds,
      chunkDurationSeconds: chunk.durationSeconds,
    });

    this.cache.set(k, sentences);
    this.onReadyCallbacks.forEach(cb => cb(book.id, chapter.index, chunkIndex, sentences));
    return sentences;
  }

  /** Schedule a chunk for background transcription (non-blocking) */
  prefetch(file: File, book: Book, chapter: Chapter, chunkIndex: number): void {
    const k = key(book.id, chapter.index, chunkIndex);
    if (this.cache.has(k) || this.inflight.has(k)) return;
    if (chunkIndex >= getChunkCount(chapter)) return;

    this.inflight.add(k);
    this.queue.push(async () => {
      try {
        await this.fetchNow(file, book, chapter, chunkIndex);
      } finally {
        this.inflight.delete(k);
      }
    });
    this.drain();
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();
    }
    this.running = false;
  }

  /** Returns all cached sentences for a chapter assembled in order */
  getChapterSentences(bookId: string, chapterIndex: number, totalChunks: number): TimestampedSentence[] {
    const all: TimestampedSentence[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const sentences = this.cache.get(key(bookId, chapterIndex, i));
      if (sentences) all.push(...sentences);
    }
    return all;
  }

  /** Seconds of chapter audio that have been transcribed ahead of a position */
  bufferedAhead(bookId: string, chapterIndex: number, currentPositionSeconds: number, chapterStartSeconds: number): number {
    // Find the last ready chunk whose start is >= currentPosition
    let buffered = 0;
    let chunkIdx = 0;
    while (true) {
      const chunkStart = chunkIdx * CHUNK_DURATION_S + chapterStartSeconds;
      const k = key(bookId, chapterIndex, chunkIdx);
      if (!this.cache.has(k)) break;
      if (chunkStart + CHUNK_DURATION_S > currentPositionSeconds) {
        buffered = chunkStart + CHUNK_DURATION_S - currentPositionSeconds;
      }
      chunkIdx++;
    }
    return Math.max(0, buffered);
  }

  clear() {
    this.cache.clear();
    this.inflight.clear();
    this.queue = [];
  }
}

// Singleton
export const transcriptionQueue = new TranscriptionQueue();
```

**Step 2: Verify TypeScript**
```bash
npm run lint
```

**Step 3: Commit**
```bash
git add src/lib/transcriptionQueue.ts
git commit -m "feat: transcription queue with background prefetch"
```

---

### Task 11: Create usePlayback hook

**Files:**
- Create: `src/hooks/usePlayback.ts`

**Step 1: Write the file**
```typescript
// src/hooks/usePlayback.ts
import { useRef, useState, useEffect, useCallback } from 'react';
import { transcriptionQueue, TranscriptionQueue } from '../lib/transcriptionQueue.js';
import { getChunkCount, CHUNK_DURATION_S } from '../lib/audioChunker.js';
import type { Book, Chapter, TimestampedSentence, PlaybackState } from '../types/index.js';

/** Binary search: last sentence index whose timeSeconds <= currentTime */
function findSentenceIndex(sentences: TimestampedSentence[], currentTime: number): number {
  if (sentences.length === 0) return 0;
  let lo = 0, hi = sentences.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (sentences[mid].timeSeconds <= currentTime) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(0, hi);
}

export interface UsePlaybackReturn {
  state: PlaybackState;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  setPlaybackRate: (rate: number) => void;
  jumpToSentence: (index: number) => void;
}

export function usePlayback(params: {
  book: Book;
  chapter: Chapter;
  file: File;
  startPositionSeconds: number;
  queue?: TranscriptionQueue;
}): UsePlaybackReturn {
  const { book, chapter, file, startPositionSeconds, queue = transcriptionQueue } = params;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const prefetchedRef = useRef<Set<number>>(new Set());

  const [state, setState] = useState<PlaybackState>({
    status: 'buffering',
    currentBook: book,
    currentChapterIndex: chapter.index,
    currentPositionSeconds: startPositionSeconds,
    playbackRate: 1.0,
    sentences: [],
    currentSentenceIndex: 0,
    bufferedSeconds: 0,
    transcriptionError: null,
  });

  // Keep a ref copy of state.sentences for the RAF loop (avoids closure staleness)
  const sentencesRef = useRef<TimestampedSentence[]>([]);
  sentencesRef.current = state.sentences;

  // ── Bootstrap: create audio element + transcribe first chunk ─────────────
  useEffect(() => {
    let cancelled = false;

    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;

    const audio = new Audio(objectUrl);
    audio.currentTime = chapter.startSeconds + startPositionSeconds;
    audio.playbackRate = state.playbackRate;
    audioRef.current = audio;

    // Transcribe first chunk
    queue.fetchNow(file, book, chapter, 0).then((sentences) => {
      if (cancelled) return;
      sentencesRef.current = sentences;
      setState(prev => ({
        ...prev,
        status: 'paused',
        sentences,
        currentSentenceIndex: findSentenceIndex(sentences, startPositionSeconds),
        bufferedSeconds: CHUNK_DURATION_S,
      }));
    }).catch(err => {
      if (cancelled) return;
      setState(prev => ({ ...prev, status: 'error', transcriptionError: String(err) }));
    });

    // Listen for queue updates (background chunks ready)
    const unsub = queue.onReady((bId, chIdx, chunkIdx, newSentences) => {
      if (bId !== book.id || chIdx !== chapter.index) return;
      setState(prev => {
        const totalChunks = getChunkCount(chapter);
        const all = queue.getChapterSentences(book.id, chapter.index, totalChunks);
        return {
          ...prev,
          sentences: all,
          bufferedSeconds: queue.bufferedAhead(book.id, chapter.index, prev.currentPositionSeconds, chapter.startSeconds),
        };
      });
    });

    return () => {
      cancelled = true;
      unsub();
      audio.pause();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      audioRef.current = null;
    };
  }, [book.id, chapter.index]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── RAF loop ─────────────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let lastIdx = -1;

    const loop = () => {
      const posInChapter = audio.currentTime - chapter.startSeconds;
      const idx = findSentenceIndex(sentencesRef.current, posInChapter);

      // Only update React state when sentence index changes
      if (idx !== lastIdx) {
        lastIdx = idx;
        setState(prev => ({
          ...prev,
          currentPositionSeconds: posInChapter,
          currentSentenceIndex: idx,
          bufferedSeconds: transcriptionQueue.bufferedAhead(book.id, chapter.index, posInChapter, 0),
        }));
      } else {
        // Still update position even if sentence didn't change (for progress bar)
        setState(prev => ({ ...prev, currentPositionSeconds: posInChapter }));
      }

      // Trigger background prefetch 30s before chunk ends
      const currentChunkIdx = Math.floor(posInChapter / CHUNK_DURATION_S);
      const posInChunk = posInChapter % CHUNK_DURATION_S;
      const nextChunkIdx = currentChunkIdx + 1;
      if (posInChunk >= 60 && !prefetchedRef.current.has(nextChunkIdx)) {
        prefetchedRef.current.add(nextChunkIdx);
        queue.prefetch(file, book, chapter, nextChunkIdx);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [book.id, chapter.index, chapter.startSeconds, file, queue]);

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────
  const play = useCallback(() => {
    audioRef.current?.play();
    setState(prev => ({ ...prev, status: 'playing' }));
    startLoop();
  }, [startLoop]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setState(prev => ({ ...prev, status: 'paused' }));
    stopLoop();
  }, [stopLoop]);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(seconds, chapter.durationSeconds));
    audio.currentTime = chapter.startSeconds + clamped;
    const idx = findSentenceIndex(sentencesRef.current, clamped);
    setState(prev => ({ ...prev, currentPositionSeconds: clamped, currentSentenceIndex: idx }));
  }, [chapter.startSeconds, chapter.durationSeconds]);

  const skipForward = useCallback((seconds = 15) => {
    setState(prev => { seekTo(prev.currentPositionSeconds + seconds); return prev; });
  }, [seekTo]);

  const skipBackward = useCallback((seconds = 15) => {
    setState(prev => { seekTo(prev.currentPositionSeconds - seconds); return prev; });
  }, [seekTo]);

  const setPlaybackRate = useCallback((rate: number) => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
    setState(prev => ({ ...prev, playbackRate: rate }));
  }, []);

  const jumpToSentence = useCallback((index: number) => {
    const sentence = sentencesRef.current[index];
    if (sentence) seekTo(sentence.timeSeconds);
  }, [seekTo]);

  // Save progress periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (state.status !== 'playing') return;
      fetch(`/api/books/${book.id}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterIndex: chapter.index, positionSeconds: state.currentPositionSeconds }),
      }).catch(() => {}); // fire and forget
    }, 10_000);
    return () => clearInterval(interval);
  }, [book.id, chapter.index, state.status, state.currentPositionSeconds]);

  return { state, play, pause, seekTo, skipForward, skipBackward, setPlaybackRate, jumpToSentence };
}
```

**Step 2: Verify TypeScript**
```bash
npm run lint
```

**Step 3: Commit**
```bash
git add src/hooks/usePlayback.ts
git commit -m "feat: usePlayback hook with RAF sync loop and prefetch trigger"
```

---

### Task 12: Create LoadingScreen

**Files:**
- Create: `src/screens/LoadingScreen.tsx`

**Step 1: Write the file**
```typescript
// src/screens/LoadingScreen.tsx
import { motion } from 'framer-motion';
import type { Book, Chapter } from '../types/index.js';

interface Props {
  book: Book;
  chapter: Chapter;
  chunkIndex: number;
  totalChunks: number;
}

export function LoadingScreen({ book, chapter, chunkIndex, totalChunks }: Props) {
  return (
    <div className="w-full h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
      {/* Blurred cover background */}
      {book.coverArtDataUrl && (
        <img
          src={book.coverArtDataUrl}
          className="absolute inset-0 w-full h-full object-cover blur-3xl scale-110 opacity-30"
          alt=""
        />
      )}
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10 flex flex-col items-center gap-8 px-8 text-center max-w-sm">
        {/* Animated waveform */}
        <div className="flex items-center gap-1.5 h-12">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="w-1 rounded-full bg-white/60"
              animate={{ scaleY: [0.4, 1.8, 0.4] }}
              transition={{
                repeat: Infinity,
                duration: 1.2,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
              style={{ height: 32 }}
            />
          ))}
        </div>

        <div>
          <p className="text-white/40 font-sans text-xs uppercase tracking-widest mb-2">
            {chunkIndex === 0 ? 'Preparing your chapter' : `Preparing section ${chunkIndex + 1} of ${totalChunks}`}
          </p>
          <p className="text-white font-serif text-2xl leading-snug">{chapter.title}</p>
          <p className="text-white/50 font-sans text-sm mt-1">{book.title}</p>
        </div>

        {/* Progress pill */}
        <div className="px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm">
          <p className="text-white/60 font-sans text-xs">
            {chunkIndex === 0 ? 'Transcribing audio…' : `Buffering text…`}
          </p>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add src/screens/LoadingScreen.tsx
git commit -m "feat: loading screen with animated waveform"
```

---

## Phase 4 — Wire Player UI

---

### Task 13: Create PlayerScreen (move + wire existing components)

**Files:**
- Create: `src/screens/PlayerScreen.tsx`

**Step 1: Create PlayerScreen.tsx**

This replaces the `PlayerScreen` function that was previously inside `App.tsx` but now receives real props and uses `usePlayback`.

```typescript
// src/screens/PlayerScreen.tsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayback } from '../hooks/usePlayback.js';
import { useIdleDetection } from '../hooks/useIdleDetection.js';
import { getChunkCount } from '../lib/audioChunker.js';
import { LoadingScreen } from './LoadingScreen.js';
import { BufferIndicator } from '../components/BufferIndicator.js';
import { PlayerControls } from '../components/PlayerControls.js';
import { PlayerHeader } from '../components/PlayerHeader.js';
import { ReadingView } from '../components/ReadingView.js';
import type { Book, Chapter } from '../types/index.js';

interface Props {
  book: Book;
  chapterIndex: number;
  startPositionSeconds: number;
  file: File;
  onBack: () => void;
}

export function PlayerScreen({ book, chapterIndex, startPositionSeconds, file, onBack }: Props) {
  const chapter: Chapter = book.chapters[chapterIndex];
  const isIdle = useIdleDetection(3000);

  const { state, play, pause, seekTo, skipForward, skipBackward, setPlaybackRate, jumpToSentence } =
    usePlayback({ book, chapter, file, startPositionSeconds });

  // Show loading screen until first chunk is ready
  if (state.status === 'buffering' || state.status === 'loading') {
    return (
      <LoadingScreen
        book={book}
        chapter={chapter}
        chunkIndex={0}
        totalChunks={getChunkCount(chapter)}
      />
    );
  }

  const isPlaying = state.status === 'playing';

  return (
    <div
      className="relative w-full h-screen bg-black font-sans overflow-hidden"
      onMouseMove={() => {}} // idle detection handled by hook
    >
      <div className="relative w-full h-full max-w-lg mx-auto flex flex-col items-center justify-center">
        {/* Background cover art */}
        <div className="absolute inset-0 w-full h-full z-0">
          {book.coverArtDataUrl ? (
            <img
              src={book.coverArtDataUrl}
              alt=""
              className="w-full h-full object-cover blur-2xl scale-110"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900" />
          )}
          <div className="absolute inset-0 bg-black/60" />
        </div>

        <PlayerHeader
          bookTitle={book.title}
          chapterTitle={chapter.title}
          onBack={() => { pause(); onBack(); }}
          isIdle={isIdle}
        />

        <main className="w-full flex-grow flex flex-col justify-center items-center pt-20 pb-48 overflow-hidden">
          <ReadingView
            sentences={state.sentences}
            currentSentenceIndex={state.currentSentenceIndex}
            isIdle={isIdle}
            onJumpToSentence={jumpToSentence}
          />
        </main>

        <BufferIndicator
          isIdle={isIdle}
          bufferedSeconds={state.bufferedSeconds}
          isTranscribing={state.status === 'buffering'}
        />

        <PlayerControls
          isIdle={isIdle}
          isPlaying={isPlaying}
          currentPositionSeconds={state.currentPositionSeconds}
          chapterDurationSeconds={chapter.durationSeconds}
          playbackRate={state.playbackRate}
          onPlay={play}
          onPause={pause}
          onSeek={seekTo}
          onSkipForward={() => skipForward(15)}
          onSkipBackward={() => skipBackward(15)}
          onSetPlaybackRate={setPlaybackRate}
        />
      </div>
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add src/screens/PlayerScreen.tsx
git commit -m "feat: PlayerScreen wired to usePlayback"
```

---

### Task 14: Update PlayerHeader, BufferIndicator, ReadingView, PlayerControls

**Files:**
- Modify: `src/components/PlayerHeader.tsx`
- Modify: `src/components/BufferIndicator.tsx`
- Modify: `src/components/ReadingView.tsx`
- Modify: `src/components/PlayerControls.tsx`

**Step 1: Update PlayerHeader.tsx**
```typescript
// src/components/PlayerHeader.tsx
import { ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';

interface PlayerHeaderProps {
  bookTitle: string;
  chapterTitle: string;
  onBack: () => void;
  isIdle: boolean;
}

export function PlayerHeader({ bookTitle, chapterTitle, onBack, isIdle }: PlayerHeaderProps) {
  return (
    <motion.header
      className="absolute top-0 left-0 right-0 z-20 p-4 bg-black/10 backdrop-blur-sm"
      animate={isIdle ? 'hidden' : 'visible'}
      variants={{ hidden: { y: '-100%', opacity: 0 }, visible: { y: '0%', opacity: 1 } }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      <div className="max-w-lg mx-auto flex items-center justify-between text-white">
        <button onClick={onBack} className="p-2">
          <ChevronLeft size={24} />
        </button>
        <div className="text-center flex-1 mx-4 truncate">
          <h2 className="font-serif text-base truncate">{chapterTitle}</h2>
          <p className="font-sans text-xs text-white/50 truncate">{bookTitle}</p>
        </div>
        <div className="w-10" />
      </div>
    </motion.header>
  );
}
```

**Step 2: Update BufferIndicator.tsx**
```typescript
// src/components/BufferIndicator.tsx
import { motion } from 'framer-motion';
import { formatTime } from '../lib/formatTime.js';

interface BufferIndicatorProps {
  isIdle: boolean;
  bufferedSeconds: number;
  isTranscribing: boolean;
}

export function BufferIndicator({ isIdle, bufferedSeconds, isTranscribing }: BufferIndicatorProps) {
  return (
    <motion.div
      className="absolute bottom-40 z-20"
      animate={isIdle ? 'hidden' : 'visible'}
      variants={{ hidden: { y: '50%', opacity: 0 }, visible: { y: '0%', opacity: 1 } }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      <div className="px-3 py-1 text-xs text-white/80 bg-white/10 rounded-full backdrop-blur-sm flex items-center gap-1.5">
        {isTranscribing && (
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-orange-400"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
          />
        )}
        {bufferedSeconds > 0
          ? `Text buffered: ${formatTime(bufferedSeconds)}`
          : isTranscribing ? 'Preparing text…' : 'Ready'}
      </div>
    </motion.div>
  );
}
```

**Step 3: Update ReadingView.tsx**

Replace `string[]` with `TimestampedSentence[]` and add tap-to-jump:
```typescript
// src/components/ReadingView.tsx
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TimestampedSentence } from '../types/index.js';

interface ReadingViewProps {
  sentences: TimestampedSentence[];
  currentSentenceIndex: number;
  isIdle: boolean;
  onJumpToSentence: (index: number) => void;
}

export function ReadingView({ sentences, currentSentenceIndex, isIdle, onJumpToSentence }: ReadingViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const activeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => { if (isIdle) setIsExpanded(false); }, [isIdle]);

  // Auto-scroll to active sentence in expanded mode
  useEffect(() => {
    if (isExpanded && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentSentenceIndex, isExpanded]);

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  const prev = sentences[currentSentenceIndex - 1];
  const current = sentences[currentSentenceIndex];
  const next = sentences[currentSentenceIndex + 1];

  return (
    <div
      className="relative z-10 w-full flex-grow flex items-center justify-center px-4 font-serif cursor-pointer"
      onClick={toggleExpanded}
    >
      <AnimatePresence mode="wait">
        {isExpanded ? (
          <motion.div
            key="expanded"
            className="w-full h-full overflow-y-auto text-left py-4 px-2 space-y-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          >
            {sentences.map((sentence, index) => (
              <p
                key={index}
                ref={index === currentSentenceIndex ? activeRef : null}
                className={`text-xl leading-relaxed cursor-pointer transition-colors duration-300 ${
                  index === currentSentenceIndex
                    ? 'text-white'
                    : index < currentSentenceIndex
                    ? 'text-white/30'
                    : 'text-white/60'
                }`}
                onClick={(e) => { e.stopPropagation(); onJumpToSentence(index); }}
              >
                {sentence.text}
              </p>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="focused"
            className="text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          >
            <AnimatePresence mode="popLayout">
              {prev && (
                <motion.p
                  key={`prev-${currentSentenceIndex}`}
                  className="text-2xl leading-relaxed opacity-40 mb-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.4 }}
                  exit={{ opacity: 0 }}
                >
                  {prev.text}
                </motion.p>
              )}
              {current && (
                <motion.p
                  key={`cur-${currentSentenceIndex}`}
                  className="text-4xl leading-snug text-white font-semibold"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.35 }}
                >
                  {current.text}
                </motion.p>
              )}
              {next && (
                <motion.p
                  key={`next-${currentSentenceIndex}`}
                  className="text-2xl leading-relaxed opacity-40 mt-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.4 }}
                  exit={{ opacity: 0 }}
                >
                  {next.text}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

**Step 4: Update PlayerControls.tsx**
```typescript
// src/components/PlayerControls.tsx
import { Play, Pause, Rewind, FastForward, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatTime } from '../lib/formatTime.js';

const SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

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
}

export function PlayerControls({
  isIdle, isPlaying, currentPositionSeconds, chapterDurationSeconds,
  playbackRate, onPlay, onPause, onSeek, onSkipForward, onSkipBackward, onSetPlaybackRate
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
      variants={{ hidden: { y: '100%', opacity: 0 }, visible: { y: '0%', opacity: 1 } }}
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
        <div className="flex items-center justify-start mt-3 text-xs text-white/50 font-sans">
          <button className="p-2 flex items-center space-x-1 hover:text-white transition-colors" onClick={cycleSpeed}>
            <Zap size={14} />
            <span>{playbackRate}x</span>
          </button>
        </div>
      </div>
    </motion.footer>
  );
}
```

**Step 5: Update App.tsx to wire PlayerScreen properly**

In `src/App.tsx`, add the file ref and wire up the `bookDetail` screen to eventually lead to the player. For now the `bookDetail` case should show a simple chapter list. This is fully replaced in Task 21.

**Step 6: Verify TypeScript**
```bash
npm run lint
```

**Step 7: Manual smoke test**
```bash
npm run dev:all
```
- Open http://localhost:3000
- Drop in an MP3/M4B
- Expect: loading screen with waveform, then player view with sentences
- Press play: audio should play, sentences should highlight
- Click a sentence: audio should jump

**Step 8: Commit**
```bash
git add src/components/ src/screens/PlayerScreen.tsx src/App.tsx
git commit -m "feat: wire player UI to usePlayback — play, sync, skip, tap-to-jump"
```

---

## Phase 5 — Library & Book Detail Screens

---

### Task 15: Create useLibrary hook

**Files:**
- Create: `src/hooks/useLibrary.ts`

**Step 1: Write the file**
```typescript
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
```

**Step 2: Commit**
```bash
git add src/hooks/useLibrary.ts
git commit -m "feat: useLibrary hook (CRUD + file map)"
```

---

### Task 16: Create BookCard and ChapterListItem components

**Files:**
- Create: `src/components/BookCard.tsx`
- Create: `src/components/ChapterListItem.tsx`

**Step 1: Create BookCard.tsx**
```typescript
// src/components/BookCard.tsx
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import type { Book } from '../types/index.js';
import { formatTime } from '../lib/formatTime.js';

interface Props {
  book: Book;
  onClick: () => void;
  compact?: boolean;
}

export function BookCard({ book, onClick, compact = false }: Props) {
  const progress = book.lastPositionSeconds && book.totalDurationMs
    ? (book.lastPositionSeconds / (book.totalDurationMs / 1000)) * 100
    : 0;

  return (
    <motion.div
      className={`relative rounded-2xl overflow-hidden bg-white/5 cursor-pointer ${compact ? 'w-36' : 'w-full'}`}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
    >
      <div className={`relative ${compact ? 'aspect-[2/3]' : 'aspect-[2/3]'} w-full`}>
        {book.coverArtDataUrl ? (
          <img src={book.coverArtDataUrl} alt={book.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
            <span className="text-white/20 font-serif text-4xl">{book.title[0]}</span>
          </div>
        )}

        {/* Progress bar overlay */}
        {progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
            <div className="h-full bg-white/80" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {!compact && (
        <div className="p-3">
          <p className="text-white font-serif text-sm leading-tight truncate">{book.title}</p>
          <p className="text-white/50 font-sans text-xs mt-0.5 truncate">{book.author}</p>
          {progress > 0 && book.lastPositionSeconds && (
            <p className="text-white/30 font-sans text-xs mt-1">
              {formatTime(book.lastPositionSeconds)} in
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
```

**Step 2: Create ChapterListItem.tsx**
```typescript
// src/components/ChapterListItem.tsx
import { Play } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Chapter } from '../types/index.js';
import { formatTime } from '../lib/formatTime.js';

interface Props {
  chapter: Chapter;
  isCurrent: boolean;
  onPlay: () => void;
}

export function ChapterListItem({ chapter, isCurrent, onPlay }: Props) {
  return (
    <motion.div
      className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-colors ${
        isCurrent ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
      whileTap={{ scale: 0.98 }}
      onClick={onPlay}
    >
      <div className="flex-1 min-w-0 mr-3">
        <p className={`font-sans text-sm truncate ${isCurrent ? 'text-white' : 'text-white/70'}`}>
          {chapter.title}
        </p>
        <p className="font-sans text-xs text-white/30 mt-0.5">{formatTime(chapter.durationSeconds)}</p>
      </div>
      <button className="p-2 text-white/40 hover:text-white transition-colors flex-shrink-0">
        <Play size={16} />
      </button>
    </motion.div>
  );
}
```

**Step 3: Commit**
```bash
git add src/components/BookCard.tsx src/components/ChapterListItem.tsx
git commit -m "feat: BookCard and ChapterListItem components"
```

---

### Task 17: Create LibraryScreen

**Files:**
- Create: `src/screens/LibraryScreen.tsx`

**Step 1: Write the file**
```typescript
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
```

**Step 2: Commit**
```bash
git add src/screens/LibraryScreen.tsx
git commit -m "feat: LibraryScreen with grid and continue listening row"
```

---

### Task 18: Create BookDetailScreen

**Files:**
- Create: `src/screens/BookDetailScreen.tsx`

**Step 1: Write the file**
```typescript
// src/screens/BookDetailScreen.tsx
import { motion } from 'framer-motion';
import { ChevronLeft, Play } from 'lucide-react';
import { ChapterListItem } from '../components/ChapterListItem.js';
import { formatTime } from '../lib/formatTime.js';
import type { Book } from '../types/index.js';

interface Props {
  book: Book;
  onBack: () => void;
  onPlayChapter: (chapterIndex: number, startPositionSeconds?: number) => void;
}

export function BookDetailScreen({ book, onBack, onPlayChapter }: Props) {
  const hasProgress = book.lastPositionSeconds && book.lastPositionSeconds > 10;
  const resumeChapter = book.lastChapterIndex ?? 0;
  const resumePosition = book.lastPositionSeconds ?? 0;

  return (
    <div className="w-full min-h-screen bg-background text-white overflow-y-auto pb-24">
      {/* Cover art hero */}
      <div className="relative w-full aspect-[4/3] overflow-hidden">
        {book.coverArtDataUrl ? (
          <img src={book.coverArtDataUrl} alt={book.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />

        {/* Back button */}
        <button
          className="absolute top-12 left-4 p-2 bg-black/40 backdrop-blur-sm rounded-full text-white"
          onClick={onBack}
        >
          <ChevronLeft size={22} />
        </button>
      </div>

      <div className="px-4 -mt-8 relative z-10">
        {/* Book info */}
        <div className="mb-6">
          <h1 className="font-serif text-2xl leading-tight">{book.title}</h1>
          <p className="font-sans text-white/50 text-sm mt-1">{book.author}</p>
          <p className="font-sans text-white/30 text-xs mt-1">
            {book.chapters.length} chapters · {formatTime(book.totalDurationMs / 1000)}
          </p>
        </div>

        {/* Play / Resume button */}
        <div className="flex gap-3 mb-8">
          {hasProgress && (
            <motion.button
              className="flex-1 flex items-center justify-center gap-2 bg-white text-black py-3 rounded-xl font-sans font-medium text-sm"
              whileTap={{ scale: 0.97 }}
              onClick={() => onPlayChapter(resumeChapter, resumePosition)}
            >
              <Play size={16} />
              Resume
            </motion.button>
          )}
          <motion.button
            className={`flex items-center justify-center gap-2 ${hasProgress ? 'px-4 bg-white/10 text-white' : 'flex-1 bg-white text-black'} py-3 rounded-xl font-sans font-medium text-sm`}
            whileTap={{ scale: 0.97 }}
            onClick={() => onPlayChapter(0, 0)}
          >
            <Play size={16} />
            {hasProgress ? 'Start Over' : 'Play'}
          </motion.button>
        </div>

        {/* Chapter list */}
        <div>
          <h2 className="font-sans text-xs uppercase tracking-widest text-white/40 mb-2">Chapters</h2>
          <div className="space-y-1">
            {book.chapters.map((chapter) => (
              <ChapterListItem
                key={chapter.index}
                chapter={chapter}
                isCurrent={chapter.index === book.lastChapterIndex}
                onPlay={() => onPlayChapter(chapter.index, 0)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add src/screens/BookDetailScreen.tsx
git commit -m "feat: BookDetailScreen with chapter list and resume"
```

---

### Task 19: Wire all screens together in App.tsx

**Files:**
- Modify: `src/App.tsx`

**Step 1: Rewrite App.tsx fully**
```typescript
// src/App.tsx
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
```

**Step 2: Full integration test**
```bash
npm run dev:all
```
Walk through:
1. Open http://localhost:3000 → Library screen (empty)
2. Tap + → pick an MP3 → loading → Book Detail with chapters
3. Tap a chapter → loading screen → player
4. Press play → audio plays + text highlights
5. Tap back → Book Detail → back → Library (book appears)
6. Reload page → Library shows book (from SQLite) but play needs file re-upload

**Step 3: Commit**
```bash
git add src/App.tsx
git commit -m "feat: wire all screens — library → detail → player flow complete"
```

---

## Phase 6 — Controls Overlay & Settings

---

### Task 20: Create ControlsOverlay (bottom sheet)

**Files:**
- Create: `src/components/ControlsOverlay.tsx`

**Step 1: Write the file**
```typescript
// src/components/ControlsOverlay.tsx
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { Book, Chapter } from '../types/index.js';
import { formatTime } from '../lib/formatTime.js';

const SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];
const SLEEP_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '15m', value: 15 * 60 },
  { label: '30m', value: 30 * 60 },
  { label: '45m', value: 45 * 60 },
  { label: 'Chapter', value: -1 },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  chapter: Chapter;
  currentPositionSeconds: number;
  playbackRate: number;
  onSeek: (seconds: number) => void;
  onSetPlaybackRate: (rate: number) => void;
  onJumpToChapter: (chapterIndex: number) => void;
}

export function ControlsOverlay({
  isOpen, onClose, book, chapter, currentPositionSeconds,
  playbackRate, onSeek, onSetPlaybackRate, onJumpToChapter,
}: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/50 z-30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-40 bg-[#1a1a1a] rounded-t-3xl p-6 pb-10 max-w-lg mx-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-6" />

            <button className="absolute top-4 right-4 p-2 text-white/40 hover:text-white" onClick={onClose}>
              <X size={18} />
            </button>

            {/* Full scrubber */}
            <div className="mb-6">
              <div className="flex justify-between text-xs text-white/40 font-sans mb-2">
                <span>{formatTime(currentPositionSeconds)}</span>
                <span>{formatTime(chapter.durationSeconds)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={chapter.durationSeconds}
                value={currentPositionSeconds}
                onChange={e => onSeek(Number(e.target.value))}
                className="w-full accent-white cursor-pointer"
              />
              {/* Chapter markers */}
              <div className="relative h-4 mt-1">
                {book.chapters.map(ch => {
                  const pct = (ch.startSeconds / (book.totalDurationMs / 1000)) * 100;
                  return (
                    <button
                      key={ch.index}
                      className="absolute -translate-x-1/2 text-white/20 text-xs font-sans hover:text-white/60"
                      style={{ left: `${pct}%` }}
                      onClick={() => { onJumpToChapter(ch.index); onClose(); }}
                      title={ch.title}
                    >
                      |
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Speed */}
            <div className="mb-6">
              <p className="text-white/40 font-sans text-xs uppercase tracking-widest mb-3">Speed</p>
              <div className="flex gap-2">
                {SPEEDS.map(speed => (
                  <button
                    key={speed}
                    className={`flex-1 py-2 rounded-xl text-sm font-sans transition-colors ${
                      speed === playbackRate ? 'bg-white text-black' : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                    onClick={() => onSetPlaybackRate(speed)}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            {/* Chapters quick-jump */}
            <div>
              <p className="text-white/40 font-sans text-xs uppercase tracking-widest mb-3">Chapters</p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-2 px-2">
                {book.chapters.map(ch => (
                  <button
                    key={ch.index}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-sans transition-colors ${
                      ch.index === chapter.index ? 'bg-white text-black' : 'bg-white/10 text-white/60'
                    }`}
                    onClick={() => { onJumpToChapter(ch.index); onClose(); }}
                  >
                    {ch.title}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

**Step 2: Add overlay trigger to PlayerControls**

In `PlayerControls.tsx`, add a prop `onOpenOverlay: () => void` and wire a `...` or `≡` icon button to it (top-right of the glass bar).

**Step 3: Add overlay state to PlayerScreen**

In `PlayerScreen.tsx`:
```typescript
const [overlayOpen, setOverlayOpen] = useState(false);
// Pass onOpenOverlay={() => setOverlayOpen(true)} to PlayerControls
// Render <ControlsOverlay> with the overlay state
```

**Step 4: Commit**
```bash
git add src/components/ControlsOverlay.tsx
git commit -m "feat: controls overlay bottom sheet (scrubber, speed, chapter jump)"
```

---

### Task 21: Create SettingsScreen

**Files:**
- Create: `src/screens/SettingsScreen.tsx`

**Step 1: Write the file**
```typescript
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
```

**Step 2: Commit**
```bash
git add src/screens/SettingsScreen.tsx
git commit -m "feat: settings screen with cache management"
```

---

## Phase 7 — Production Build

---

### Task 22: Production build + Cloud Run prep

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `Dockerfile`

**Step 1: Update build scripts in package.json**
```json
"build": "vite build",
"start": "NODE_ENV=production tsx server/index.ts"
```
Note: using `tsx` in production keeps the server runnable without a separate compile step, which is simpler for Cloud Run. For a fully compiled build, replace with the tsc approach.

**Step 2: Add `optimizeDeps` to vite.config.ts**
```typescript
optimizeDeps: {
  exclude: ['better-sqlite3'],
},
```

**Step 3: Create Dockerfile**
```dockerfile
FROM node:22-slim

# better-sqlite3 requires python3 + build tools for native compile
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["tsx", "server/index.ts"]
```

Note: Set `SERVER_PORT=8080` to match Cloud Run's default port, or update server/index.ts to read `process.env.PORT`.

**Step 4: Update server port handling**

In `server/index.ts`, change:
```typescript
const PORT = process.env.SERVER_PORT ?? process.env.PORT ?? 3001;
```

**Step 5: Test production build locally**
```bash
npm run build
NODE_ENV=production tsx server/index.ts
```
Open http://localhost:3001 — should serve the Vite build.

**Step 6: Commit**
```bash
git add Dockerfile vite.config.ts package.json server/index.ts
git commit -m "feat: production build + Dockerfile for Cloud Run"
```

---

## Verification Checklist

Run these checks before considering the build complete:

```bash
# 1. Dev servers start without errors
npm run dev:all

# 2. TypeScript passes
npm run lint

# 3. Production build succeeds
npm run build && NODE_ENV=production tsx server/index.ts
```

**Manual flow verification:**

| Step | Expected |
|------|----------|
| Open http://localhost:3000 | Library screen, empty state |
| Tap + → select MP3/M4B | Loading spinner → Book Detail with chapter list |
| Tap a chapter | Loading screen with waveform animation |
| Loading completes | Player screen, play button active |
| Press play | Audio plays, current sentence highlighted |
| Tap another sentence | Audio jumps to that sentence |
| Press skip forward | Audio advances 15s, sentence updates |
| Wait 60s into chunk | Network tab shows `/api/transcribe` for chunk 2 |
| Press back → Library | Book appears with cover art |
| Reload page | Book still in library (SQLite), but play requires file re-open |
| Select same chapter again | Loads instantly (cache hit — `fromCache: true` in server log) |

---

## Critical File Paths

```
src/types/index.ts              ← All shared interfaces
server/index.ts                 ← Express + SQLite + Gemini
src/lib/audioMetadata.ts        ← File → Book (chapters, cover, id)
src/lib/audioChunker.ts         ← Blob.slice by time
src/lib/transcriptionQueue.ts   ← Background prefetch manager
src/hooks/usePlayback.ts        ← RAF sync loop + audio control
src/App.tsx                     ← Screen router
src/screens/PlayerScreen.tsx    ← Wires all player components
src/components/ReadingView.tsx  ← Tap-to-jump sentences
src/components/PlayerControls.tsx ← Play/pause/skip/speed
```
