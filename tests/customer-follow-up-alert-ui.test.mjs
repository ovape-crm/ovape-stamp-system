import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const customerDetailPage = await readFile(
  new URL('../src/app/(auth)/customers/[id]/page.tsx', import.meta.url),
  'utf8',
);

test('처리 필요 특이사항 등록 직후에는 처리 선택을 다시 열지 않는다', () => {
  const createHandler = customerDetailPage.slice(
    customerDetailPage.indexOf('const handleCreateFollowUpRemark'),
    customerDetailPage.indexOf('const openFollowUpProcessing'),
  );

  assert.match(createHandler, /setIsFollowUpAlertOpen\(false\)/);
  assert.doesNotMatch(createHandler, /setIsFollowUpAlertOpen\(\(result\.data/);
  assert.match(customerDetailPage, /isFollowUpAlertOpen && \(followUpQuery\.data\?\.length/);
});
