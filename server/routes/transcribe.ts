import express from 'express';
import fs from 'fs';
import { getFile, deleteFile } from '../db.js';
import { extractSegment } from '../services/extract.js';
import { transcribeAudio } from '../services/whisper.js';

const router = express.Router();

const MAX_CHUNK_SECONDS = 120; // safety cap — well above our 90 s chunks

router.post('/', async (req, res) => {
  const { fileId, startTime, endTime } = req.body as {
    fileId?: unknown;
    startTime?: unknown;
    endTime?: unknown;
  };

  // ── Validate ────────────────────────────────────────────────────────────
  if (typeof fileId !== 'string' || !fileId) {
    res.status(400).json({ error: 'fileId is required' });
    return;
  }
  if (typeof startTime !== 'number' || typeof endTime !== 'number') {
    res.status(400).json({ error: 'startTime and endTime must be numbers' });
    return;
  }
  if (startTime < 0 || endTime <= startTime) {
    res.status(400).json({ error: 'Invalid time range' });
    return;
  }
  if (endTime - startTime > MAX_CHUNK_SECONDS) {
    res.status(400).json({ error: `Chunk too large (max ${MAX_CHUNK_SECONDS}s)` });
    return;
  }

  // ── Look up file ─────────────────────────────────────────────────────────
  const stored = getFile(fileId);
  if (!stored) {
    res.status(404).json({ error: 'File not found. Please re-upload.' });
    return;
  }
  if (!fs.existsSync(stored.path)) {
    deleteFile(fileId); // stale DB record
    res.status(404).json({ error: 'File has expired. Please re-upload.' });
    return;
  }

  // ── Extract & transcribe ─────────────────────────────────────────────────
  try {
    const audioBuffer = await extractSegment(stored.path, startTime, endTime);
    const words = await transcribeAudio(audioBuffer, startTime);
    res.json({ words });
  } catch (err) {
    console.error('[transcribe] error:', err);
    const message = err instanceof Error ? err.message : 'Transcription failed';
    res.status(500).json({ error: message });
  }
});

export default router;
