import ffmpeg from 'fluent-ffmpeg';

/**
 * Extracts an audio segment from a file and returns it as a Buffer.
 *
 * Uses input-side seeking (-ss before -i) for fast seeking. This is slightly
 * less precise than output-side seeking but fast enough for large files —
 * any small drift at the start is covered by the 2-second chunk overlap.
 *
 * Output: mono, 16 kHz, 64 kbps MP3 — small enough for Whisper API uploads.
 */
export function extractSegment(
  filePath: string,
  startTime: number,
  endTime: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const proc = ffmpeg(filePath)
      .seekInput(startTime)
      .duration(endTime - startTime)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(16000)
      .audioBitrate('64k')
      .format('mp3');

    const stream = proc.pipe();
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (err: Error) => reject(err));
    proc.on('error', (err: Error) => reject(err));
  });
}
