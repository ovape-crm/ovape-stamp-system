'use client';

import { useEffect, useState } from 'react';

const FullscreenButton = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));

    handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen();
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
