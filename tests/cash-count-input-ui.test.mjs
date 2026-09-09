import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(
  new URL('../src/app/(auth)/cash-management/page.tsx', import.meta.url),
  'utf8',
);

test('시재 권종 개수는 세 자리까지만 직접 입력할 수 있다', () => {
  assert.match(page, /inputMode="numeric"/);
  assert.match(page, /maxLength=\{3\}/);
  assert.match(page, /!\/\^\[0-9\]\{1,3\}\$\//);
});

test('시재 권종 개수는 출고 수량과 같은 증감 버튼으로 조절한다', () => {
  assert.match(page, /Math\.max\(0, count - 1\)/);
  assert.match(page, /Math\.min\(999, count \+ 1\)/);
  assert.match(page, /flex h-9 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-300/);
  assert.match(page, /flex h-9 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/);
});

test('시재 권종 두 개를 한 줄에 배치해도 금액 영역이 서로 겹치지 않는다', () => {
  assert.match(
    page,
    /grid min-w-0 grid-cols-\[64px_auto_minmax\(0,1fr\)\] items-center gap-2/,
  );
  assert.match(page, /className="w-12 rounded-md border border-gray-200/);
  assert.match(page, /min-w-0 whitespace-nowrap text-right text-xs tabular-nums/);
});
