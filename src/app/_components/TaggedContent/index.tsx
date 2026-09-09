import { Fragment, type ReactNode } from 'react';

type NoteNode = {
  tag?: string;
  url?: string;
  children: Array<NoteNode | string>;
};

const noteTagRegex = /<\/?(?:red|blue|green|bold|line|yellow-bg|pink-bg|blue-bg|link)(?: url="[^"]*")?>/g;
const openingNoteTagRegex = /^<(red|blue|green|bold|line|yellow-bg|pink-bg|blue-bg|link)(?: url="([^"]*)")?>$/;

const parseNoteNodes = (value: string): NoteNode => {
  const root: NoteNode = { children: [] };
  const stack = [root];
  let lastIndex = 0;

  for (const match of value.matchAll(noteTagRegex)) {
    const token = match[0];
    if (match.index! > lastIndex) {
      stack.at(-1)!.children.push(value.slice(lastIndex, match.index));
    }
    lastIndex = match.index! + token.length;

    if (token.startsWith('</')) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    const opening = token.match(openingNoteTagRegex);
    if (!opening) {
      stack.at(-1)!.children.push(token);
      continue;
    }
    const node: NoteNode = { tag: opening[1], url: opening[2], children: [] };
    stack.at(-1)!.children.push(node);
    stack.push(node);
  }

  if (lastIndex < value.length) stack.at(-1)!.children.push(value.slice(lastIndex));
  return root;
};

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

const noteTagClassName: Record<string, string> = {
  red: 'text-red-500',
  blue: 'text-blue-600',
  green: 'text-emerald-600',
  bold: 'font-extrabold',
  line: 'line-through',
  'yellow-bg': 'rounded-sm bg-amber-100 px-0.5',
  'pink-bg': 'rounded-sm bg-rose-100 px-0.5',
  'blue-bg': 'rounded-sm bg-sky-100 px-0.5',
};

const renderNoteChildren = (
  children: NoteNode['children'],
  keyword: string,
  keyPrefix: string,
): ReactNode[] =>
  children.map((child, index) => {
    const key = `${keyPrefix}-${index}`;
    if (typeof child === 'string') {
      return <Fragment key={key}>{renderHighlightedText(child, keyword, key)}</Fragment>;
    }
    const content = renderNoteChildren(child.children, keyword, key);
    if (child.tag === 'link' && child.url) {
      return <a key={key} href={child.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline underline-offset-2 hover:text-blue-700">{content}</a>;
    }
    return <span key={key} className={noteTagClassName[child.tag ?? '']}>{content}</span>;
  });

const renderLine = (line: string, lineKey: string, keyword: string) =>
  renderNoteChildren(parseNoteNodes(line).children, keyword, lineKey);

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
