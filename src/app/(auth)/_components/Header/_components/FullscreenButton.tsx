'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const FULLSCREEN_PREFERENCE_KEY = 'app-fullscreen-preferred';

const FullscreenButton = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const prefersFullscreenRef = useRef(false);

  const requestFullscreen = useCallback(async () => {
    if (document.fullscreenElement || !document.fullscreenEnabled) return true;

    try {
      await document.documentElement.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    const restoreFullscreen = () => {
      if (
        prefersFullscreenRef.current &&
        document.visibilityState === 'visible' &&
        !document.fullscreenElement
      ) {
        void requestFullscreen();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') restoreFullscreen();
    };

    prefersFullscreenRef.current =
      window.localStorage.getItem(FULLSCREEN_PREFERENCE_KEY) === 'true';
    handleFullscreenChange();
    restoreFullscreen();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('pointerdown', restoreFullscreen, true);
    document.addEventListener('keydown', restoreFullscreen, true);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('pointerdown', restoreFullscreen, true);
      document.removeEventListener('keydown', restoreFullscreen, true);
    };
  }, [requestFullscreen]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      prefersFullscreenRef.current = false;
      window.localStorage.removeItem(FULLSCREEN_PREFERENCE_KEY);
      await document.exitFullscreen();
      return;
    }

    prefersFullscreenRef.current = true;
    window.localStorage.setItem(FULLSCREEN_PREFERENCE_KEY, 'true');
    const enteredFullscreen = await requestFullscreen();
    if (!enteredFullscreen) {
      prefersFullscreenRef.current = false;
      window.localStorage.removeItem(FULLSCREEN_PREFERENCE_KEY);
    }
  };

  return (
    <button
      type="button"
      onClick={toggleFullscreen}
      aria-label={isFullscreen ? '전체화면 종료' : '전체화면'}
      title={isFullscreen ? '전체화면 종료' : '전체화면'}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-100 bg-white/90 text-brand-700 shadow-sm transition-all hover:border-brand-200 hover:bg-white hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      {isFullscreen ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <path d="M9 3v6H3" />
          <path d="m3 9 6-6" />
          <path d="M15 3v6h6" />
          <path d="m21 9-6-6" />
          <path d="M9 21v-6H3" />
          <path d="m3 15 6 6" />
          <path d="M15 21v-6h6" />
          <path d="m21 15-6 6" />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <path d="M9 9 3 3" />
          <path d="M3 8V3h5" />
          <path d="m15 9 6-6" />
          <path d="M16 3h5v5" />
          <path d="m9 15-6 6" />
          <path d="M3 16v5h5" />
          <path d="m15 15 6 6" />
          <path d="M16 21h5v-5" />
        </svg>
      )}
    </button>
  );
};

export default FullscreenButton;
