'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import TaggedContent from '@/app/_components/TaggedContent';

type FormatAction = {
  label: string;
  tag?: string;
  clearTags?: string[];
  className: string;
  ariaLabel: string;
  previewBackground?: string;
};

const actions: FormatAction[] = [
  { label: 'B', tag: 'bold', className: 'font-extrabold', ariaLabel: '굵게' },
  { label: '가', tag: 'red', className: 'text-red-600', ariaLabel: '글자색 빨강' },
  { label: '가', tag: 'blue', className: 'text-blue-600', ariaLabel: '글자색 파랑' },
  { label: '가', tag: 'green', className: 'text-emerald-600', ariaLabel: '글자색 초록' },
  { label: '가', clearTags: ['red', 'blue', 'green'], className: 'text-gray-900', ariaLabel: '글자색 기본(검정)' },
  { label: '가', tag: 'yellow-bg', className: 'text-gray-800', ariaLabel: '배경색 노랑', previewBackground: '#fef3c7' },
  { label: '가', tag: 'pink-bg', className: 'text-gray-800', ariaLabel: '배경색 분홍', previewBackground: '#ffe4e6' },
  { label: '가', tag: 'blue-bg', className: 'text-gray-800', ariaLabel: '배경색 파랑', previewBackground: '#e0f2fe' },
  { label: '가', clearTags: ['yellow-bg', 'pink-bg', 'blue-bg'], className: 'text-gray-800', ariaLabel: '배경색 기본(투명)' },
  { label: 'S', tag: 'line', className: 'line-through', ariaLabel: '취소선' },
];

const tagClassName: Record<string, string> = {
  bold: 'font-extrabold',
  red: 'text-red-600',
  blue: 'text-blue-600',
  green: 'text-emerald-600',
  'yellow-bg': 'rounded-sm bg-amber-100 px-0.5',
  'pink-bg': 'rounded-sm bg-rose-100 px-0.5',
  'blue-bg': 'rounded-sm bg-sky-100 px-0.5',
  line: 'line-through',
};

const exclusiveTagGroups = [
  ['red', 'blue', 'green'],
  ['yellow-bg', 'pink-bg', 'blue-bg'],
];

const unwrapElement = (element: HTMLElement) => {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
};

const isRangeFullyTagged = (
  root: HTMLElement,
  range: Range,
  tag: string,
) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let hasSelectedText = false;
  let node = walker.nextNode();

  while (node) {
    if (node.textContent?.length && range.intersectsNode(node)) {
      hasSelectedText = true;
      let parent = node.parentElement;
      let isTagged = false;
      while (parent && parent !== root) {
        if (parent.dataset.noteTag === tag) {
          isTagged = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (!isTagged) return false;
    }
    node = walker.nextNode();
  }

  return hasSelectedText;
};

const unwrapTags = (fragment: DocumentFragment, tags: string[]) => {
  Array.from(fragment.querySelectorAll<HTMLElement>('[data-note-tag]'))
    .filter((element) => tags.includes(element.dataset.noteTag ?? ''))
    .reverse()
    .forEach(unwrapElement);
};

const getClosestTaggedAncestor = (
  root: HTMLElement,
  node: Node,
  tags: string[],
) => {
  let element = node instanceof HTMLElement ? node : node.parentElement;
  while (element && element !== root) {
    if (tags.includes(element.dataset.noteTag ?? '')) return element;
    element = element.parentElement;
  }
  return null;
};

const rangeStartsAtElementStart = (range: Range, element: HTMLElement) => {
  const elementRange = document.createRange();
  elementRange.selectNodeContents(element);
  return range.compareBoundaryPoints(Range.START_TO_START, elementRange) === 0;
};

const rangeEndsAtElementEnd = (range: Range, element: HTMLElement) => {
  const elementRange = document.createRange();
  elementRange.selectNodeContents(element);
  return range.compareBoundaryPoints(Range.END_TO_END, elementRange) === 0;
};

const expandRangeToFormattingBoundaries = (
  root: HTMLElement,
  range: Range,
  tags: string[],
) => {
  // 선택이 서식 span의 "내용 안"에 있을 때에도 해당 span을 추출 범위에 포함한다.
  // 안쪽/바깥쪽에 중복된 색상 span이 있어도 반복 확장으로 모두 한 번에 정리한다.
  for (let index = 0; index < 20; index += 1) {
    let expanded = false;
    const selectedText = range.toString();
    const startAncestors: HTMLElement[] = [];
    let startParent = range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement;
    while (startParent && startParent !== root) {
      if (tags.includes(startParent.dataset.noteTag ?? '')) startAncestors.push(startParent);
      startParent = startParent.parentElement;
    }

    // 글자색 span 안에 배경색 span이 있는 경우처럼, 선택 시작/끝이 서로 다른
    // 서식 태그 안쪽에 있어도 전체 문장이 같으면 바깥쪽 같은 그룹 태그까지 확장한다.
    const enclosingTag = startAncestors.find(
      (element) =>
        element.contains(range.endContainer) &&
        Boolean(selectedText) &&
        element.textContent === selectedText,
    );
    if (enclosingTag) {
      range.setStartBefore(enclosingTag);
      range.setEndAfter(enclosingTag);
      continue;
    }

    const startElement = getClosestTaggedAncestor(root, range.startContainer, tags);
    if (startElement && rangeStartsAtElementStart(range, startElement)) {
      range.setStartBefore(startElement);
      expanded = true;
    }
    const endElement = getClosestTaggedAncestor(root, range.endContainer, tags);
    if (endElement && rangeEndsAtElementEnd(range, endElement)) {
      range.setEndAfter(endElement);
      expanded = true;
    }
    if (!expanded) break;
  }
};

const selectInsertedNodes = (selection: Selection, nodes: Node[]) => {
  if (!nodes.length) return;
  const range = document.createRange();
  range.setStartBefore(nodes[0]);
  range.setEndAfter(nodes[nodes.length - 1]);
  selection.removeAllRanges();
  selection.addRange(range);
};

const removeEmptyFormatting = (root: HTMLElement) => {
  Array.from(root.querySelectorAll<HTMLElement>('[data-note-tag]'))
    .reverse()
    .forEach((element) => {
      if (!element.textContent?.trim() && !element.querySelector('br')) {
        element.remove();
      }
    });
};

const isSafeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const toEditorHtml = (value: string) => {
  let html = escapeHtml(value).replace(/\n/g, '<br>');
  Object.entries(tagClassName).forEach(([tag, className]) => {
    html = html
      .replace(
        new RegExp(`&lt;${tag}&gt;`, 'g'),
        `<span data-note-tag="${tag}" class="${className}">`,
      )
      .replace(new RegExp(`&lt;/${tag}&gt;`, 'g'), '</span>');
  });
  html = html.replace(
    /&lt;link url="([^"]*)"&gt;(.*?)&lt;\/link&gt;/g,
    (_, url, title) =>
      `<a data-note-link-url="${url}" href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline underline-offset-2">${title}</a>`,
  );
  return html;
};

const serializeNode = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof HTMLElement)) return '';
  if (node.tagName === 'BR') return '\n';
  const content = Array.from(node.childNodes).map(serializeNode).join('');
  const tag = node.dataset.noteTag;
  if (tag && tagClassName[tag]) return `<${tag}>${content}</${tag}>`;
  const linkUrl = node.dataset.noteLinkUrl;
  if (node.tagName === 'A' && linkUrl) return `<link url="${linkUrl}">${content}</link>`;
  return node.tagName === 'DIV' ? `${content}\n` : content;
};

const RichTextNoteEditor = ({
  value,
  onChange,
  disabled = false,
  ariaInvalid,
  placeholder = '고객, 결제 관련 특이사항을 입력하세요. 문장을 선택한 뒤 위 버튼으로 서식을 적용하세요.',
  previewLabel = '표시 미리보기',
  enableLinks = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaInvalid?: boolean;
  placeholder?: string;
  previewLabel?: string;
  enableLinks?: boolean;
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastSerializedRef = useRef('');
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    if (!editorRef.current || value === lastSerializedRef.current) return;
    editorRef.current.innerHTML = toEditorHtml(value);
    lastSerializedRef.current = value;
  }, [value]);

  const emitValue = () => {
    if (!editorRef.current) return;
    removeEmptyFormatting(editorRef.current);
    const nextValue = Array.from(editorRef.current.childNodes)
      .map(serializeNode)
      .join('')
      .replace(/\n$/, '');
    lastSerializedRef.current = nextValue;
    onChange(nextValue);
  };

  const applyTag = (tag: string) => {
    if (disabled || !editorRef.current) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) return;
    const exclusiveGroup = exclusiveTagGroups.find((group) => group.includes(tag));
    const shouldRemoveTag = isRangeFullyTagged(editorRef.current, range, tag);
    const tagsToReplace = exclusiveGroup ?? [tag];
    expandRangeToFormattingBoundaries(editorRef.current, range, tagsToReplace);
    const extracted = range.extractContents();

    // 같은 서식은 다시 누르면 해제하고, 글자색/배경색은 항상 하나만 남긴다.
    // 다른 서식(굵게·취소선 등)은 중첩을 허용하되 같은 태그 중첩은 만들지 않는다.
    unwrapTags(extracted, tagsToReplace);
    if (shouldRemoveTag) {
      const insertedNodes = Array.from(extracted.childNodes);
      range.insertNode(extracted);
      removeEmptyFormatting(editorRef.current);
      selectInsertedNodes(selection, insertedNodes);
      emitValue();
      return;
    }

    const wrapper = document.createElement('span');
    wrapper.dataset.noteTag = tag;
    wrapper.className = tagClassName[tag];
    wrapper.appendChild(extracted);
    range.insertNode(wrapper);
    removeEmptyFormatting(editorRef.current);
    selection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);
    selection.addRange(nextRange);
    emitValue();
  };

  const clearTagGroup = (tags: string[]) => {
    if (disabled || !editorRef.current) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) return;

    expandRangeToFormattingBoundaries(editorRef.current, range, tags);
    const extracted = range.extractContents();
    unwrapTags(extracted, tags);
    const insertedNodes = Array.from(extracted.childNodes);
    range.insertNode(extracted);
    removeEmptyFormatting(editorRef.current);
    selectInsertedNodes(selection, insertedNodes);
    emitValue();
  };

  const addLink = () => {
    const title = linkTitle.trim();
    const url = linkUrl.trim();
    if (!title) {
      toast.error('하이퍼링크 제목을 입력하세요.');
      return;
    }
    if (!isSafeUrl(url) || /["<>]/.test(url) || /[<>]/.test(title)) {
      toast.error('http:// 또는 https:// 주소를 입력하세요.');
      return;
    }
    if (!editorRef.current) return;

    const link = document.createElement('a');
    link.dataset.noteLinkUrl = url;
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'text-blue-500 underline underline-offset-2';
    link.textContent = title;
    editorRef.current.appendChild(document.createTextNode(editorRef.current.textContent ? ' ' : ''));
    editorRef.current.appendChild(link);
    emitValue();
    setLinkTitle('');
    setLinkUrl('');
    setIsAddingLink(false);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-300 bg-white transition hover:border-brand-300 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
        {actions.map((action) => (
          <button
            key={action.tag ?? action.clearTags?.join('-')}
            type="button"
            aria-label={action.ariaLabel}
            title={action.ariaLabel}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (action.tag) applyTag(action.tag);
              else if (action.clearTags) clearTagGroup(action.clearTags);
            }}
            style={action.previewBackground ? { backgroundColor: action.previewBackground } : undefined}
            className={`flex h-7 min-w-7 items-center justify-center rounded border border-gray-200 bg-white px-1 text-xs transition hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40 ${action.className}`}
          >
            {action.label}
          </button>
        ))}
        {enableLinks && (
          <button
            type="button"
            aria-label="하이퍼링크 추가"
            title="하이퍼링크 추가"
            disabled={disabled}
            onClick={() => setIsAddingLink((current) => !current)}
            className="flex h-7 items-center justify-center rounded border border-gray-200 bg-white px-2 text-xs font-semibold text-blue-600 transition hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            링크
          </button>
        )}
      </div>
      {enableLinks && isAddingLink && (
        <div className="grid gap-2 border-b border-gray-200 bg-gray-50/70 px-2 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
          <input
            value={linkTitle}
            onChange={(event) => setLinkTitle(event.target.value)}
            placeholder="하이퍼링크 제목"
            disabled={disabled}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed"
          />
          <input
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https:// 주소 입력"
            inputMode="url"
            disabled={disabled}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={addLink}
            disabled={disabled}
            className="rounded-md bg-brand-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            추가
          </button>
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        aria-invalid={ariaInvalid}
        data-placeholder={placeholder}
        onInput={emitValue}
        className="min-h-20 w-full whitespace-pre-wrap break-words border-0 bg-white px-3 py-2 text-sm outline-none empty:before:pointer-events-none empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)]"
      />
      {value.trim() && (
        <div className="border-t border-gray-100 bg-gray-50 px-3 py-2">
          <p className="mb-1 text-[11px] font-medium text-gray-500">{previewLabel}</p>
          <TaggedContent content={value} className="text-sm text-gray-800" />
        </div>
      )}
    </div>
  );
};

export default RichTextNoteEditor;
