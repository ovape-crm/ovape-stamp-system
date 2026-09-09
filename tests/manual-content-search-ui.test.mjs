import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const search = await readFile(
  new URL(
    '../src/app/_components/ManualContentSearch/index.tsx',
    import.meta.url,
  ),
  'utf8',
);
const taggedContent = await readFile(
  new URL('../src/app/_components/TaggedContent/index.tsx', import.meta.url),
  'utf8',
);
const helpButton = await readFile(
  new URL('../src/app/_components/ManualHelpButton.tsx', import.meta.url),
  'utf8',
);
const detailModal = await readFile(
  new URL(
    '../src/app/(auth)/manuals/_components/ManualDetailModal/index.tsx',
    import.meta.url,
  ),
  'utf8',
);

test('매뉴얼 본문 검색은 결과 수를 표시하고 검색어를 지울 수 있다', () => {
  assert.match(search, /매뉴얼 내용에서 검색/);
  assert.match(search, /activeMatchIndex \+ 1/);
  assert.match(search, /매뉴얼 본문 검색어 지우기/);
  assert.match(search, /일치하는 내용이 없습니다/);
  assert.match(search, /이전 검색 결과/);
  assert.match(search, /다음 검색 결과/);
  assert.match(search, /scrollIntoView/);
  assert.match(search, /flex shrink-0 items-center gap-2/);
  assert.match(search, /h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-gray-200/);
});

test('본문 검색어는 태그 표현을 보존한 채 강조된다', () => {
  assert.match(taggedContent, /highlightKeyword\?: string/);
  assert.match(taggedContent, /bg-amber-200/);
  assert.match(taggedContent, /data-manual-search-hit/);
  assert.match(taggedContent, /renderNoteChildren/);
  assert.match(taggedContent, /renderHighlightedText\(child, keyword, key\)/);
});

test('? 도움말과 매뉴얼 카테고리 상세가 동일한 본문 검색을 사용한다', () => {
  assert.match(helpButton, /<ManualContentSearch content=\{manual\.content\} \/>/);
  assert.match(detailModal, /<ManualContentSearch[\s\S]*?content=\{manual\.content\}/);
});
