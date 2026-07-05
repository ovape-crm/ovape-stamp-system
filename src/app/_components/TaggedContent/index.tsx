import { Fragment } from 'react';

const TAG_SPLIT_REGEX =
  /(<red>.*?<\/red>|<bold>.*?<\/bold>|<line>.*?<\/line>|<link url="[^"]*">.*?<\/link>)/g;

const renderLine = (line: string, lineKey: string) => {
  const parts = line.split(TAG_SPLIT_REGEX);
  if (parts.length === 1) return line;

  return parts.map((part, i) => {
    const key = `${lineKey}-${i}`;

    const redMatch = part.match(/^<red>(.*)<\/red>$/);
    if (redMatch) {
      return (
        <span key={key} className="text-red-500">
          {redMatch[1]}
        </span>
      );
    }

    const boldMatch = part.match(/^<bold>(.*)<\/bold>$/);
    if (boldMatch) {
      return (
        <span key={key} className="font-extrabold">
          {boldMatch[1]}
        </span>
      );
    }

    const lineMatch = part.match(/^<line>(.*)<\/line>$/);
    if (lineMatch) {
      return (
        <span key={key} className="line-through">
          {lineMatch[1]}
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
          {linkMatch[2]}
        </a>
      );
    }

    return <Fragment key={key}>{part || null}</Fragment>;
  });
};

interface TaggedContentProps {
  content: string;
  className?: string;
}

const TaggedContent = ({ content, className = '' }: TaggedContentProps) => {
  const lines = content.split('\n');

  return (
    <div className={className}>
      {lines.map((line, i) => (
        <p key={i}>{line ? renderLine(line, String(i)) : ' '}</p>
      ))}
    </div>
  );
};

export default TaggedContent;
