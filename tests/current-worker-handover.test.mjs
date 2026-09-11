import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const currentWorker = await readFile(
  new URL('../src/app/_domains/_workJournal/_utils/currentWorker.ts', import.meta.url),
  'utf8',
);
const workJournalService = await readFile(
  new URL('../src/app/_domains/_workJournal/_services/workJournalService.ts', import.meta.url),
  'utf8',
);
const logService = await readFile(
  new URL('../src/app/_domains/_log/_services/logService.ts', import.meta.url),
  'utf8',
);

test('현재 작업자는 당일 가장 나중에 출근한 근무 기록을 우선한다', () => {
  assert.match(currentWorker, /\.eq\('status', 'working'\)/);
  assert.match(currentWorker, /\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(currentWorker, /\.limit\(1\)/);
  assert.match(logService, /return resolveActiveWorkerName\(\)/);
});

test('앞 근무자의 늦은 퇴근 처리는 후속 근무자를 다시 동기화한다', () => {
  assert.match(workJournalService, /await resolveCurrentWorkerName\(\)/);
  assert.doesNotMatch(
    workJournalService,
    /localStorage\.removeItem\("current-work-worker"\)/,
  );
});
