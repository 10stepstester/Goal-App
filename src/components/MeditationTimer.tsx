'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type TimerState = 'idle' | 'running' | 'complete';

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio not available
  }
}

function playCompletionChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const notes = [800, 1000, 1200];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.5);
    });
  } catch {
    // Audio not available
  }
}

export default function MeditationTimer() {
  const [state, setState] = useState<TimerState>('idle');
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastChimeRef = useRef(0);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback((minutes: number) => {
    cleanup();
    const secs = minutes * 60;
    setTotalSeconds(secs);
    setRemaining(secs);
    setState('running');
    lastChimeRef.current = secs;
    playChime();

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        // Chime every 30 seconds
        if (next > 0 && next % 30 === 0 && next !== lastChimeRef.current) {
          lastChimeRef.current = next;
          playChime();
        }
        if (next <= 0) {
          cleanup();
          setState('complete');
          playCompletionChime();
          return 0;
        }
        return next;
      });
    }, 1000);
  }, [cleanup]);

  const cancel = useCallback(() => {
    cleanup();
    setState('idle');
    setRemaining(0);
  }, [cleanup]);

  const reset = useCallback(() => {
    setState('idle');
    setRemaining(0);
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const progress = totalSeconds > 0 ? (totalSeconds - remaining) / totalSeconds : 0;
  const circumference = 2 * Math.PI * 54;
  const strokeOffset = circumference - progress * circumference;

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm font-medium text-indigo-300 tracking-wide uppercase">
        Get Centered
      </p>

      {state === 'idle' && (
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60" cy="60" r="54"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-gray-800"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl text-gray-500">--:--</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => start(2)}
              className="px-4 py-2 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 transition-all duration-200 text-sm font-medium"
            >
              2 min
            </button>
            <button
              onClick={() => start(5)}
              className="px-4 py-2 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 transition-all duration-200 text-sm font-medium"
            >
              5 min
            </button>
          </div>
        </div>
      )}

      {state === 'running' && (
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60" cy="60" r="54"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-gray-800"
              />
              <circle
                cx="60" cy="60" r="54"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-indigo-400 transition-all duration-1000 ease-linear"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeOffset}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-mono text-indigo-200 tabular-nums">
                {mm}:{ss}
              </span>
            </div>
          </div>
          <button
            onClick={cancel}
            className="px-4 py-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-all duration-200 text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {state === 'complete' && (
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60" cy="60" r="54"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-indigo-400"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-10 h-10 text-indigo-300 animate-bounce-gentle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <p className="text-indigo-300 text-sm font-medium">Centered</p>
          <button
            onClick={reset}
            className="px-4 py-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-all duration-200 text-sm"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
