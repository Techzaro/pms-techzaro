import { useState, useEffect, useRef, useCallback } from 'react';

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function useWorkTimer(timerData) {
  const [workDisplay, setWorkDisplay] = useState('00:00:00');
  const [workSeconds, setWorkSeconds] = useState(0);
  const [elapsedDisplay, setElapsedDisplay] = useState('00:00:00');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pauseDisplay, setPauseDisplay] = useState('00:00:00');
  const [pauseSeconds, setPauseSeconds] = useState(0);
  const intervalRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearTimer();

    if (!timerData || !timerData.state || timerData.state === 'idle') {
      setWorkDisplay('00:00:00');
      setWorkSeconds(0);
      setElapsedDisplay('00:00:00');
      setElapsedSeconds(0);
      setPauseDisplay('00:00:00');
      setPauseSeconds(0);
      return;
    }

    const state = timerData.state;
    const baseWork = timerData.work_seconds || 0;
    const baseElapsed = timerData.elapsed_seconds || 0;
    const basePause = timerData.total_pause_seconds || 0;

    if (state === 'completed') {
      setWorkSeconds(baseWork);
      setWorkDisplay(formatDuration(baseWork));
      setElapsedSeconds(baseElapsed);
      setElapsedDisplay(formatDuration(baseElapsed));
      setPauseSeconds(basePause);
      setPauseDisplay(formatDuration(basePause));
      return;
    }

    const eventAt = timerData.last_timer_event_at
      ? new Date(timerData.last_timer_event_at).getTime()
      : Date.now();

    if (state === 'running') {
      const tick = () => {
        const delta = Math.max(0, Math.floor((Date.now() - eventAt) / 1000));
        const w = baseWork + delta;
        const e = baseElapsed + delta;
        setWorkSeconds(w);
        setWorkDisplay(formatDuration(w));
        setElapsedSeconds(e);
        setElapsedDisplay(formatDuration(e));
        setPauseSeconds(basePause);
        setPauseDisplay(formatDuration(basePause));
      };

      tick();
      intervalRef.current = setInterval(tick, 1000);
    }

    if (state === 'paused') {
      const tick = () => {
        const delta = Math.max(0, Math.floor((Date.now() - eventAt) / 1000));
        const e = baseElapsed + delta;
        const p = basePause + delta;
        setWorkSeconds(baseWork);
        setWorkDisplay(formatDuration(baseWork));
        setElapsedSeconds(e);
        setElapsedDisplay(formatDuration(e));
        setPauseSeconds(p);
        setPauseDisplay(formatDuration(p));
      };

      tick();
      intervalRef.current = setInterval(tick, 1000);
    }

    return clearTimer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerData?.state, timerData?.work_seconds, timerData?.elapsed_seconds, timerData?.last_timer_event_at, timerData?.total_pause_seconds, timerData?.pause_count]);

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  return {
    workDisplay,
    workSeconds,
    elapsedDisplay,
    elapsedSeconds,
    pauseDisplay,
    pauseSeconds,
    pauseCount: timerData?.pause_count || 0,
    state: timerData?.state || 'idle',
  };
}
