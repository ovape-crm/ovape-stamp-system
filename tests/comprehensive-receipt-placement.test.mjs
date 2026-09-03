import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import React from 'react';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/app/(auth)/settlement/_components/ComprehensiveSettlement.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
// Execute the real component and its handlers with isolated state/query data; no DB requests.
function harness() {
  const states = []; let cursor = 0;
  const entries = ['a', 'b'].flatMap((id, i) => [
    { id, entry_type: 'receipt', source_receipt_id: id, entry_date: `2026-09-0${i + 1}`, created_at: `2026-09-0${i + 1}`, amount: 500 },
    { id: `${id}-pay`, entry_type: 'payment', related_receipt_id: id, entry_date: `2026-09-0${i + 1}`, created_at: `2026-09-0${i + 1}`, amount: 100, payment_method: '현금' },
  ]);
  const orders = [{ inventory_suppliers: { name: '종합' }, inventory_purchase_order_lines: [{ id: 'line', unit_price: 500 }],
    inventory_purchase_receipts: ['a', 'b', 'new'].map((id, i) => ({ id, arrived_on: `2026-09-0${i + 1}`, inventory_purchase_receipt_lines: [{ id: `${id}-line`, order_line_id: 'line', item_name: '검증품목', quantity: 1 }] })) }];
  const mocks = {
    react: { ...React, useRef: () => ({ current: null }), useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value; }]; } },
    '@tanstack/react-query': { useQuery: ({ queryKey }) => ({ data: queryKey.length > 1 ? orders : entries }), useQueryClient: () => ({}) },
    'html-to-image': {}, 'react-hot-toast': { success() {}, error() {} },
    '@/app/_components/Button': 'button', '@/libs/supabaseClient': {},
    '@/app/_domains/_inventory/_services/inventoryService': {},
  };
  const componentModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => mocks[name] ?? require(name), componentModule, componentModule.exports);
  const render = () => { cursor = 0; return componentModule.exports.default(); };
  return { render };
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement(node)) return [];
  return [node, ...nodes(node.props.children)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  return React.isValidElement(node) ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
const click = async (tree, label, index = 0) => {
  const button = nodes(tree).filter(node => node.props.onClick && text(node) === label)[index];
  assert.ok(button, label); await button.props.onClick();
};
const panels = tree => nodes(tree).filter(node => node.type === 'section' && node.props.className.includes('border-brand-200'));

test('불러오기는 종합정산에 기존 전표와 지급 입력을 표시하고 이력 탭으로 새지 않는다', async () => {
  const h = harness(); await click(h.render(), '불러오기');
  let tree = h.render(); assert.equal(panels(tree).length, 1);
  assert.ok(nodes(tree).some(node => node.props.placeholder === '지급액 입력'));
  for (const label of ['제품 합계금액', '최종 잔금', '전표 저장']) assert.ok(text(panels(tree)[0]).includes(label));
  await click(tree, '정산 이력'); assert.equal(panels(h.render()).length, 0);
});

test('완료 전표는 선택한 행 바로 다음에 하나만 표시하며 사진 복사와 지급액을 유지한다', async () => {
  const h = harness(); await click(h.render(), '정산 이력'); await click(h.render(), '전표 보기', 1);
  let tree = h.render(); assert.equal(panels(tree).length, 1);
  const group = nodes(tree).find(node => node.type === React.Fragment && node.key === 'a');
  assert.equal(group.props.children[1], panels(tree)[0]);
  assert.ok(text(panels(tree)[0]).includes('사진 복사')); assert.ok(text(panels(tree)[0]).includes('현금 지급액'));
  await click(tree, '전표 보기', 0); tree = h.render(); assert.equal(panels(tree).length, 1);
  await click(tree, '종합 정산'); assert.equal(panels(h.render()).length, 0);
});

test('전체 이력 펼치기와 기존 수정·삭제를 복구하고 닫기는 전표만 닫는다', async () => {
  const h = harness(); await click(h.render(), '정산 이력');
  const details = nodes(h.render()).find(node => node.type === 'details');
  assert.ok(text(details).includes('개별 정산 전체 이력 펼치기')); assert.ok(text(details).includes('전표 수정')); assert.ok(text(details).includes('삭제'));
  await click(h.render(), '전표 보기'); await click(h.render(), '선택 해제'); assert.equal(panels(h.render()).length, 0);
});
