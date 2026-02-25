// Load .env before anything that reads process.env (e.g. OpenAI client)
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import uploadRouter from './routes/upload.js';
import transcribeRouter from './routes/transcribe.js';
import { getOldFiles, deleteFile } from './db.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api/upload', uploadRouter);
app.use('/api/transcribe', transcribeRouter);

function runCleanup(): void {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const old = getOldFiles(TWO_HOURS);
  for (const { fileId, path } of old) {
    try {
      fs.unlinkSync(path);
    } catch {
      // File may already be gone
    }
    deleteFile(fileId);
    console.log(`[cleanup] removed ${fileId}`);
  }
}

runCleanup();
setInterval(runCleanup, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
