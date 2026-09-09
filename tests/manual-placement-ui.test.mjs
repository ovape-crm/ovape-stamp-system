import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manager = await readFile(
  new URL("../src/app/_components/ManualPlacementManager.tsx", import.meta.url),
  "utf8",
);
const outboundModal = await readFile(
  new URL("../src/app/(auth)/customers/_components/StampConfirmModal.tsx", import.meta.url),
  "utf8",
);

test("매뉴얼 배치는 접힌 편집 아이콘에서만 시작한다", () => {
  assert.match(manager, /aria-label="매뉴얼 편집 열기"/);
  assert.match(manager, /배치 시작/);
  assert.match(manager, /\? 배경 표시/);
  assert.match(manager, /배경 크기/);
});

test("숨은 모달 단계에는 물음표를 표시하지 않고 단계 버튼은 고정 키로 식별한다", () => {
  assert.match(manager, /const visibleCandidates = candidates\.filter\(isVisibleElement\)/);
  assert.match(manager, /!placementElement \|\| !isPlacementTargetVisible\(placementElement\)/);
  assert.match(manager, /modalRoot\?\.childElementCount && !element\.closest\("#modal-root"\)/);
  assert.match(manager, /모든 clipping 부모 안에/);
  assert.match(outboundModal, /data-manual-key="outbound-modal-previous-step"/);
  assert.match(outboundModal, /data-manual-key="outbound-modal-next-step"/);
  assert.match(outboundModal, /data-manual-key="outbound-modal-confirm"/);
});

test("기본 도움말 배경은 원형이 아닌 둥근 사각형이다", async () => {
  const button = await readFile(
    new URL("../src/app/_components/ManualHelpButton.tsx", import.meta.url),
    "utf8",
  );
  assert.match(button, /rounded-lg bg-brand-500 text-white/);
  assert.doesNotMatch(button, /showCircle \? "rounded-full/);
});
