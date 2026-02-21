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
