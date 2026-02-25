import express from 'express';

const router = express.Router();

// Phase 2: will extract audio segments and call Whisper
router.post('/', (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

export default router;
