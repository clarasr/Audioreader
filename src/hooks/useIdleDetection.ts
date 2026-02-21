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
