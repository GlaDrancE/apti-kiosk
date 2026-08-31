import { useEffect, useRef } from 'react';
import { EVENT_FLUSH_INTERVAL_MS, isStrike, type EventType } from '@apti/shared';
import { api } from '../lib/api';

interface ProctorState {
  suspiciousScore: number;
  strikes: number;
  maxStrikes: number;
  remaining: number;
  warn: boolean;
}

interface Options {
  attemptId: string;
  enabled: boolean;
  onUpdate: (state: ProctorState) => void;
  onAutoSubmit: () => void;
}

interface QueuedEvent {
  eventType: EventType;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

/**
 * Browser-activity monitoring for a live attempt.
 *
 * This is monitoring, not lockdown: it cannot see a second screen, a phone, or
 * a printed sheet, and a student who disables JavaScript sends nothing at all.
 * Events are queued locally and flushed in batches so a brief network drop does
 * not lose the record of what happened during it — except for strikes (leaving
 * the exam), which are sent the instant they happen. Waiting up to
 * EVENT_FLUSH_INTERVAL_MS to report those would hand a cheater a free window
 * on every violation, including the last one.
 */
export function useProctoring({ attemptId, enabled, onUpdate, onAutoSubmit }: Options) {
  const queue = useRef<QueuedEvent[]>([]);
  // Callbacks change identity every render; a ref keeps the listeners stable so
  // they are attached exactly once per attempt.
  const cb = useRef({ onUpdate, onAutoSubmit });
  cb.current = { onUpdate, onAutoSubmit };

  useEffect(() => {
    if (!enabled) return;

    const flush = async () => {
      if (queue.current.length === 0) return;
      const batch = queue.current.splice(0, queue.current.length);
      try {
        const res = await api.post<ProctorState & { autoSubmitted: boolean }>(
          `/attempts/${attemptId}/events`,
          { events: batch },
        );

        cb.current.onUpdate(res);
        if (res.autoSubmitted) cb.current.onAutoSubmit();
      } catch {
        // Put the batch back so an offline stretch is reported once we recover.
        queue.current.unshift(...batch);
      }
    };

    const push = (eventType: EventType, metadata: Record<string, unknown> = {}) => {
      queue.current.push({ eventType, metadata, occurredAt: new Date().toISOString() });
      // A strike must reach the server now, not on the next timer tick.
      if (isStrike(eventType)) void flush();
    };

    const onVisibility = () =>
      push(document.hidden ? 'TAB_HIDDEN' : 'TAB_VISIBLE', {
        visibilityState: document.visibilityState,
      });
    const onBlur = () => push('WINDOW_BLUR');
    const onFocus = () => push('WINDOW_FOCUS');
    const onFullscreen = () =>
      push(document.fullscreenElement ? 'FULLSCREEN_ENTER' : 'FULLSCREEN_EXIT');
    const onCopy = () => push('COPY');
    const onPaste = () => push('PASTE');
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      push('RIGHT_CLICK');
    };
    const onOffline = () => push('NETWORK_DISCONNECT');
    const onOnline = () => {
      push('NETWORK_RECONNECT');
      void flush();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    // Second tab on the same attempt: each tab announces itself, and any tab
    // that hears another announcement for its own attempt reports it.
    const channel = new BroadcastChannel(`attempt-${attemptId}`);
    const tabId = crypto.randomUUID();
    channel.onmessage = (e: MessageEvent<{ tabId: string }>) => {
      if (e.data.tabId !== tabId) push('MULTIPLE_SESSION_DETECTED', { otherTab: e.data.tabId });
    };
    channel.postMessage({ tabId });

    const timer = setInterval(() => void flush(), EVENT_FLUSH_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      channel.close();
      clearInterval(timer);
      void flush();
    };
  }, [attemptId, enabled]);
}
