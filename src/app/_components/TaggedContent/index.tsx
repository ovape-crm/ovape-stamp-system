import { Fragment } from 'react';

const TAG_SPLIT_REGEX =
  /(<red>.*?<\/red>|<blue>.*?<\/blue>|<green>.*?<\/green>|<bold>.*?<\/bold>|<line>.*?<\/line>|<yellow-bg>.*?<\/yellow-bg>|<pink-bg>.*?<\/pink-bg>|<blue-bg>.*?<\/blue-bg>|<link url="[^"]*">.*?<\/link>)/g;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const renderHighlightedText = (
  value: string,
  keyword: string,
  keyPrefix: string,
) => {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) return value;

  const parts = value.split(
    new RegExp(`(${escapeRegExp(normalizedKeyword)})`, 'gi'),
  );

  return parts.map((part, index) =>
    part.toLocaleLowerCase('ko-KR') ===
    normalizedKeyword.toLocaleLowerCase('ko-KR') ? (
      <mark
        key={`${keyPrefix}-${index}`}
        data-manual-search-hit
        className="rounded-sm bg-amber-200 px-0.5 text-inherit"
      >
        {part}
      </mark>
    ) : (
      <Fragment key={`${keyPrefix}-${index}`}>{part || null}</Fragment>
    ),
  );
};

const renderLine = (line: string, lineKey: string, keyword: string) => {
  const parts = line.split(TAG_SPLIT_REGEX);
  if (parts.length === 1)
    return renderHighlightedText(line, keyword, `${lineKey}-plain`);

  return parts.map((part, i) => {
    const key = `${lineKey}-${i}`;

    const redMatch = part.match(/^<red>(.*)<\/red>$/);
    if (redMatch) {
      return (
        <span key={key} className="text-red-500">
          {renderHighlightedText(redMatch[1], keyword, key)}
        </span>
      );
    }

    const boldMatch = part.match(/^<bold>(.*)<\/bold>$/);
    if (boldMatch) {
      return (
        <span key={key} className="font-extrabold">
          {renderHighlightedText(boldMatch[1], keyword, key)}
        </span>
      );
    }

    const colorTag = [
      ['blue', 'text-blue-600'],
      ['green', 'text-emerald-600'],
      ['yellow-bg', 'rounded-sm bg-amber-100 px-0.5'],
      ['pink-bg', 'rounded-sm bg-rose-100 px-0.5'],
      ['blue-bg', 'rounded-sm bg-sky-100 px-0.5'],
    ].find(([tag]) => part.match(new RegExp(`^<${tag}>(.*)<\\/${tag}>$`)));
    if (colorTag) {
      const match = part.match(
        new RegExp(`^<${colorTag[0]}>(.*)<\\/${colorTag[0]}>$`),
      );
      return (
        <span key={key} className={colorTag[1]}>
          {renderHighlightedText(match?.[1] ?? '', keyword, key)}
        </span>
      );
    }

    const lineMatch = part.match(/^<line>(.*)<\/line>$/);
    if (lineMatch) {
      return (
        <span key={key} className="line-through">
          {renderHighlightedText(lineMatch[1], keyword, key)}
        </span>
      );
    }

    const linkMatch = part.match(/^<link url="([^"]*)">(.*)<\/link>$/);
    if (linkMatch) {
      return (
        <a
          key={key}
          href={linkMatch[1]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 underline underline-offset-2 hover:text-blue-700"
        >
          {renderHighlightedText(linkMatch[2], keyword, key)}
        </a>
      );
    }

    return (
      <Fragment key={key}>
        {renderHighlightedText(part, keyword, key)}
      </Fragment>
    );
  });
};

interface TaggedContentProps {
  content: string;
  className?: string;
  highlightKeyword?: string;
}

const TaggedContent = ({
  content,
  className = '',
  highlightKeyword = '',
}: TaggedContentProps) => {
  const lines = content.split('\n');

  return (
    <div className={className}>
      {lines.map((line, i) => (
        <p key={i}>
          {line ? renderLine(line, String(i), highlightKeyword) : ' '}
        </p>
      ))}
    </div>
  );
};

export default TaggedContent;
