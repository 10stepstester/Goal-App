'use client';

import { useState, useEffect, useCallback } from 'react';
import type { User } from '@/types/index';

type NudgeStyle = User['nudge_style'];

const NUDGE_OPTIONS: { value: NudgeStyle; label: string }[] = [
  { value: 'direct', label: 'Direct (Spicy \u{1F336}\u{FE0F})' },
  { value: 'average', label: 'Average (Friendly)' },
  { value: 'gentle', label: 'Gentle (Soft)' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12;
  const ampm = i < 12 ? 'AM' : 'PM';
  return { value: `${String(i).padStart(2, '0')}:00`, label: `${h}:00 ${ampm}` };
});

export default function Settings() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [nudgeStyle, setNudgeStyle] = useState<NudgeStyle>('average');
  const [activeHoursStart, setActiveHoursStart] = useState('09:00');
  const [activeHoursEnd, setActiveHoursEnd] = useState('21:00');
  const [outcomeTarget, setOutcomeTarget] = useState('');
  const [hasGoogleCalendar, setHasGoogleCalendar] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/user/settings');
      if (res.ok) {
        const json = await res.json();
        const data: Partial<User> = json.user || json;
        if (data.phone_number) setPhoneNumber(data.phone_number);
        if (data.nudge_style) setNudgeStyle(data.nudge_style);
        if (data.active_hours_start) setActiveHoursStart(data.active_hours_start);
        if (data.active_hours_end) setActiveHoursEnd(data.active_hours_end);
        if (data.outcome_target) setOutcomeTarget(data.outcome_target);
        setHasGoogleCalendar(!!data.google_calendar_token);
      }
    } catch {
      // Failed to load
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (open && !loaded) {
      loadSettings();
    }
  }, [open, loaded, loadSettings]);

  const save = async () => {
    setSaving(true);
    try {
      await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phoneNumber,
          nudge_style: nudgeStyle,
          active_hours_start: activeHoursStart,
          active_hours_end: activeHoursEnd,
          outcome_target: outcomeTarget,
        }),
      });
      setOpen(false);
    } catch {
      // Save failed
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Gear Icon Button */}
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all duration-200"
        title="Settings"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-out Panel */}
      <div
        className={`
          fixed top-0 right-0 h-full w-full max-w-md bg-gray-900 border-l border-gray-800 z-50
          transform transition-transform duration-300 ease-out
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
            <h2 className="text-lg font-semibold text-white">Settings</h2>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {/* Phone Number */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Nudge Style */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Nudge Style</label>
              <div className="space-y-2">
                {NUDGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setNudgeStyle(opt.value)}
                    className={`
                      w-full px-4 py-3 rounded-lg text-left text-sm font-medium
                      border transition-all duration-200
                      ${nudgeStyle === opt.value
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                      }
                    `}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Active Hours */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Active Hours</label>
              <div className="flex items-center gap-3">
                <select
                  value={activeHoursStart}
                  onChange={(e) => setActiveHoursStart(e.target.value)}
                  className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white outline-none focus:border-blue-500 transition-colors"
                >
                  {HOURS.map((h) => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
                <span className="text-gray-500 text-sm">to</span>
                <select
                  value={activeHoursEnd}
                  onChange={(e) => setActiveHoursEnd(e.target.value)}
                  className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white outline-none focus:border-blue-500 transition-colors"
                >
                  {HOURS.map((h) => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Outcome Target */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Outcome Target</label>
              <input
                type="text"
                value={outcomeTarget}
                onChange={(e) => setOutcomeTarget(e.target.value)}
                placeholder="What are you working towards?"
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Google Calendar */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Google Calendar</label>
              {hasGoogleCalendar ? (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Connected
                </div>
              ) : (
                <a
                  href="/api/auth/google"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 hover:border-gray-600 hover:text-white transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Connect Google Calendar
                </a>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-800">
            <button
              onClick={save}
              disabled={saving}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors duration-200"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
