import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const input = await readFile(
  new URL('../src/app/_components/DeviceValueInput/index.tsx', import.meta.url),
  'utf8',
);
const richTextEditor = await readFile(
  new URL('../src/app/_components/RichTextNoteEditor/index.tsx', import.meta.url),
  'utf8',
);
const createModal = await readFile(
  new URL('../src/app/(auth)/comparison/_components/DeviceCreateModal.tsx', import.meta.url),
  'utf8',
);
const editModal = await readFile(
  new URL('../src/app/(auth)/comparison/_components/DeviceEditModal/index.tsx', import.meta.url),
  'utf8',
);

test('기기 입력은 제목과 주소를 분리해 여러 하이퍼링크를 연결한다', () => {
  assert.match(input, /enableLinks/);
  assert.match(richTextEditor, /하이퍼링크 추가/);
  assert.match(richTextEditor, /하이퍼링크 제목/);
  assert.match(richTextEditor, /https:\/\/ 주소 입력/);
  assert.match(richTextEditor, /<link url=/);
  assert.match(richTextEditor, /url\.protocol === 'https:'/);
  assert.match(richTextEditor, /font-extrabold/);
  assert.match(richTextEditor, /yellow-bg/);
});

test('기기 추가와 수정 모두 같은 링크 연결 입력을 사용한다', () => {
  assert.match(createModal, /<DeviceValueInput/);
  assert.match(editModal, /<DeviceValueInput/);
});
