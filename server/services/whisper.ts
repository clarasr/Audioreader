import OpenAI, { toFile } from 'openai';

export interface WordToken {
  word: string;
  start: number; // absolute seconds in the source file
  end: number;
}

// Lazy-initialised so startup fails loudly if the key is missing,
// rather than crashing silently on the first transcription request.
let _openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not set. Add it to your .env file and restart the server.'
      );
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

/**
 * Transcribes an audio buffer using Whisper and returns word-level tokens
 * with timestamps adjusted to be absolute (relative to the full source file).
 *
 * @param audioBuffer  MP3 audio data for the segment
 * @param startOffset  Start time of the segment in the source file (seconds).
 *                     Added to every word timestamp so callers get absolute times.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  startOffset: number
): Promise<WordToken[]> {
  const client = getClient();

  const file = await toFile(audioBuffer, 'segment.mp3', { type: 'audio/mpeg' });

  const response = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });

  // `words` is populated because we requested timestamp_granularities: ['word']
  const words = (response as { words?: Array<{ word: string; start: number; end: number }> })
    .words ?? [];

  return words.map((w) => ({
    word: w.word.trim(),
    start: w.start + startOffset,
    end: w.end + startOffset,
  }));
}
