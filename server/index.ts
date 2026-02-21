// server/index.ts
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import multer from 'multer'; // Import multer
import type { TranscribeRequest, TranscribeResponse, TimestampedSentence } from '../src/types/index.js';

dotenv.config({ path: '.env.local' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.SERVER_PORT ?? 3001;
const DB_PATH = path.join(__dirname, '../data/audioreader.db');
const IS_PROD = process.env.NODE_ENV === 'production';
const UPLOAD_DIR = path.join(__dirname, '../uploads'); // Create an uploads directory

// ── Multer Configuration ───────────────────────────────────────────────────────
// Make sure to install multer: npm install multer
// And the types: npm install --save-dev @types/multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR)
  },
  filename: function (req, file, cb) {
    // Note: this is not safe for production.
    // You'd want to sanitize filenames and handle potential name collisions.
    cb(null, `${Date.now()}-${file.originalname}`)
  }
});
const upload = multer({ storage: storage });

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
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    file_path TEXT
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
      (id, title, author, cover_art_data_url, total_duration_ms, file_size_bytes, mime_type, chapters_json, last_opened_at, last_chapter_index, last_position_seconds, file_path)
    VALUES (@id, @title, @author, @coverArtDataUrl, @totalDurationMs, @fileSizeBytes, @mimeType, @chaptersJson, @lastOpenedAt, @lastChapterIndex, @lastPositionSeconds, @filePath)
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
    VALUES (?, ?, ?, ?, ?, ?)\
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
  const lines = raw.trim().split('\\n');
  const results: TimestampedSentence[] = [];
  const re = /^\\[(\\d+):(\\d{2})(?:\\.(\\d+))?\\]\\s*(.+)$/;
  const failedLines: Array<{ lineNumber: number; line: string }> = [];

  for (const [index, line] of lines.entries()) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const m = trimmedLine.match(re);
    if (!m) {
      failedLines.push({ lineNumber: index + 1, line: trimmedLine });
      continue;
    }

    const timeSeconds = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseFloat(`0.${m[3]}`) : 0);
    const text = m[4].trim();
    if (text) results.push({ timeSeconds, text });
  }

  if (failedLines.length > 0) {
    console.warn('[parseTranscription] Skipped malformed timestamp lines', {
      failedCount: failedLines.length,
      totalLines: lines.length,
      failedLines,
    });
  }

  if (results.length === 0 && raw.trim()) {
    console.error('[parseTranscription] No sentences parsed from model output', {
      lineCount: lines.length,
      raw,
    });
  }

  return results;
}

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: IS_PROD ? false : 'http://localhost:3000' }));
app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(UPLOAD_DIR)); // Serve uploaded files statically

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
    filePath: b.filePath,
  });
  res.json({ success: true });
});

// POST /api/upload
app.post('/api/upload', upload.single('audioFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const filePath = `/uploads/${req.file.filename}`;
  res.json({ success: true, filePath });
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
