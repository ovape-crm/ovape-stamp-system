import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const card = await readFile(
  new URL(
    '../src/app/(auth)/customers/_components/TargetCustomerCard.tsx',
    import.meta.url,
  ),
  'utf8',
);

test('고객 특이사항은 기본 배경 강조 없이 사용자가 지정한 서식만 표시한다', () => {
  assert.match(card, /const noteText = note\?\.trim\(\)/);
  assert.doesNotMatch(card, /rounded-sm bg-amber-100 px-1 py-0\.5 text-gray-900/);
  assert.match(card, /<span className="text-gray-900">/);
  assert.match(card, /<TaggedContent content=\{noteText\} \/>/);
  assert.match(card, /"등록 없음"/);
});
