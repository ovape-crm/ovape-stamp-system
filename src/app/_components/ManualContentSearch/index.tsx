'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import TaggedContent from '@/app/_components/TaggedContent';

interface ManualContentSearchProps {
  content: string;
  className?: string;
}

const countOccurrences = (content: string, keyword: string) => {
  const searchText = content.replace(/<[^>]+>/g, '').toLocaleLowerCase('ko-KR');
  const normalizedKeyword = keyword.trim().toLocaleLowerCase('ko-KR');
  if (!normalizedKeyword) return 0;

  let count = 0;
  let fromIndex = 0;
  while (fromIndex < searchText.length) {
    const matchIndex = searchText.indexOf(normalizedKeyword, fromIndex);
    if (matchIndex === -1) break;
    count += 1;
    fromIndex = matchIndex + normalizedKeyword.length;
  }
  return count;
};

const ManualContentSearch = ({
  content,
  className = 'text-sm leading-relaxed text-gray-800',
}: ManualContentSearchProps) => {
  const [keyword, setKeyword] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const resultCount = useMemo(
    () => countOccurrences(content, keyword),
    [content, keyword],
  );

  useEffect(() => {
    setKeyword('');
  }, [content]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [keyword]);

  useEffect(() => {
    if (!keyword.trim()) return;

    const frame = window.requestAnimationFrame(() => {
      const matches = Array.from(
        contentRef.current?.querySelectorAll<HTMLElement>(
          '[data-manual-search-hit]',
        ) ?? [],
      );
      const normalizedIndex =
        matches.length === 0 ? 0 : activeMatchIndex % matches.length;

      matches.forEach((match, index) => {
        match.classList.toggle('bg-amber-400', index === normalizedIndex);
        match.classList.toggle('ring-1', index === normalizedIndex);
        match.classList.toggle('ring-amber-500', index === normalizedIndex);
      });
      matches[normalizedIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeMatchIndex, keyword]);

  const moveToMatch = (direction: 'previous' | 'next') => {
    if (resultCount === 0) return;
    setActiveMatchIndex((current) =>
      direction === 'next'
        ? (current + 1) % resultCount
        : (current - 1 + resultCount) % resultCount,
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <label className="relative min-w-0 flex-1">
          {keyword ? (
            <button
              type="button"
              onClick={() => setKeyword('')}
              aria-label="매뉴얼 본문 검색어 지우기"
              className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
            >
              ×
            </button>
          ) : (
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
              />
            </svg>
          )}
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="매뉴얼 내용에서 검색"
            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        {keyword && (
          <div className="flex shrink-0 items-center gap-1">
            <span className="min-w-10 text-right text-xs font-medium text-gray-500">
              {resultCount ? `${activeMatchIndex + 1}/${resultCount}` : '0건'}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveToMatch('previous')}
                disabled={resultCount === 0}
                aria-label="이전 검색 결과"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-500 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveToMatch('next')}
                disabled={resultCount === 0}
                aria-label="다음 검색 결과"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-500 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35"
              >
                ↓
              </button>
            </div>
          </div>
        )}
      </div>
      {keyword.trim() && resultCount === 0 && (
        <p className="-mt-1 text-xs text-gray-500">일치하는 내용이 없습니다.</p>
      )}
      <div
        ref={contentRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3"
      >
        <TaggedContent
          content={content}
          highlightKeyword={keyword}
          className={className}
        />
      </div>
    </div>
  );
};

export default ManualContentSearch;
