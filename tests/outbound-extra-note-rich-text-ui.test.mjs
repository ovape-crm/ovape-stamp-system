import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const historyItem = await readFile(
  new URL('../src/app/(auth)/histories/_components/StampHistories/StampHistoryItem.tsx', import.meta.url),
  'utf8',
);
const confirmModal = await readFile(
  new URL('../src/app/(auth)/customers/_components/StampConfirmModal.tsx', import.meta.url),
  'utf8',
);
const copyHook = await readFile(
  new URL('../src/app/_domains/_log/_hooks/useCopy.ts', import.meta.url),
  'utf8',
);
const taggedContent = await readFile(
  new URL('../src/app/_components/TaggedContent/index.tsx', import.meta.url),
  'utf8',
);
const logService = await readFile(
  new URL('../src/app/_domains/_log/_services/logService.ts', import.meta.url),
  'utf8',
);
const unifiedHistory = await readFile(
  new URL('../src/app/(auth)/histories/_components/StampHistories/index.tsx', import.meta.url),
  'utf8',
);
const customerHistory = await readFile(
  new URL('../src/app/(auth)/customers/[id]/_components/CustomersDetailStampsHistories/index.tsx', import.meta.url),
  'utf8',
);

test('출고 특이사항은 확인과 이력 화면에서 저장된 서식 태그를 해석한다', () => {
  assert.match(historyItem, /import TaggedContent/);
  assert.match(historyItem, /<TaggedContent content=\{shipmentExtraNote\} inline \/>/);
  assert.match(confirmModal, /label: "출고 메모"[\s\S]*?<TaggedContent/);
  assert.match(confirmModal, /시연용 전체 특이사항[\s\S]*?<TaggedContent/);
});

test('출고 이력 복사는 서식 태그 대신 일반 텍스트를 복사한다', () => {
  assert.match(taggedContent, /export const stripTaggedContent/);
  assert.match(copyHook, /import \{ stripTaggedContent \}/);
  assert.match(copyHook, /stripTaggedContent\(extraNoteValue\)\.trim\(\)/);
});

test('출고 메모로 생성된 특이사항은 원출고 메모 수정 흐름으로 연결한다', () => {
  assert.match(logService, /export const updateOutboundMemoRemark/);
  assert.match(logService, /extraNote: content\.trim\(\)/);
  assert.match(logService, /rpc\("update_outbound_memo_remark"/);
  for (const source of [unifiedHistory, customerHistory]) {
    assert.match(source, /outboundMemoSourceLogId/);
    assert.match(source, /title="출고 메모 수정"/);
    assert.match(source, /updateOutboundMemoRemark/);
  }
});
