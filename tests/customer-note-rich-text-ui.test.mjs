import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const editor = await readFile(
  new URL('../src/app/_components/RichTextNoteEditor/index.tsx', import.meta.url),
  'utf8',
);
const createModal = await readFile(
  new URL(
    '../src/app/(auth)/customers/_components/CustomerCreateModal.tsx',
    import.meta.url,
  ),
  'utf8',
);
const editModal = await readFile(
  new URL(
    '../src/app/(auth)/customers/[id]/_components/CustomerEditModal.tsx',
    import.meta.url,
  ),
  'utf8',
);
const taggedContent = await readFile(
  new URL('../src/app/_components/TaggedContent/index.tsx', import.meta.url),
  'utf8',
);
const customerInfo = await readFile(
  new URL(
    '../src/app/(auth)/customers/[id]/_components/CustomerInfo.tsx',
    import.meta.url,
  ),
  'utf8',
);
const targetCustomerCard = await readFile(
  new URL(
    '../src/app/(auth)/customers/_components/TargetCustomerCard.tsx',
    import.meta.url,
  ),
  'utf8',
);
const editModalLayout = editModal;

test('고객 특이사항 편집기는 굵게·글자색·배경색 선택 서식을 제공한다', () => {
  assert.match(editor, /tag: 'bold'/);
  assert.match(editor, /tag: 'red'/);
  assert.match(editor, /tag: 'yellow-bg'/);
  assert.match(editor, /tag: 'pink-bg'/);
  assert.match(editor, /선택 문장/);
  assert.match(editor, /표시 미리보기/);
  assert.match(editor, /contentEditable=\{!disabled\}/);
  assert.match(editor, /data-note-tag/);
  assert.doesNotMatch(editor, /<textarea/);
});

test('고객 추가와 수정에서 동일한 특이사항 서식 편집기를 사용한다', () => {
  assert.match(createModal, /<RichTextNoteEditor/);
  assert.match(editModal, /<RichTextNoteEditor/);
  assert.match(createModal, /<TaggedContent/);
  assert.match(taggedContent, /yellow-bg/);
  assert.match(taggedContent, /blue-bg/);
});

test('내용이 긴 고객 수정 모달도 하단 저장 영역을 고정한다', () => {
  assert.match(editModalLayout, /max-h-\[calc\(90vh-2rem\)\] flex-col/);
  assert.match(editModalLayout, /min-h-0 flex-1 space-y-3 overflow-y-auto pr-1/);
  assert.match(editModalLayout, /mt-4 flex shrink-0 justify-between border-t/);
});

test('서식 본문은 문단 태그 안에 중첩하지 않아 하이드레이션 오류가 없다', () => {
  assert.doesNotMatch(customerInfo, /<p className="text-sm text-gray-800 whitespace-pre-wrap">[\s\S]*?<TaggedContent/);
  assert.match(
    targetCustomerCard,
    /<div[\s\S]*?\{noteText \? \([\s\S]*?<TaggedContent/,
  );
});
