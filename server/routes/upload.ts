import express from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { insertFile } from '../db.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
});

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }

  // The uuid is the filename without extension
  const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
  insertFile(fileId, req.file.path, req.file.originalname);

  res.json({ fileId });
});

export default router;
