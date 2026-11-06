import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../src/app/(auth)/liqud-stand/page.tsx", import.meta.url),
  "utf8",
);
const service = await readFile(
  new URL(
    "../src/app/_domains/_liqudStand/_services/liqudStandService.ts",
    import.meta.url,
  ),
  "utf8",
);

test("시연대 기간 필터에 당일을 별도로 제공하면서 기존 당일~구간도 유지한다", () => {
  assert.match(page, /\{ value: 'today', label: '당일' \}/);
  assert.match(page, /\{ value: 'black', label: `당일~\$\{settings\.blue_days - 1\}일` \}/);
  assert.match(page, /status === 'today' \|\| status === 'black'/);
});

test("시연대 교체 날짜는 두 칸 이상 선택했을 때만 일괄 변경한다", () => {
  assert.match(page, /교체 날짜 일괄 변경/);
  assert.match(page, /bulkDateCellIds\.length < 2/);
  assert.match(page, /updateLiqudStandCellsInstalledOn\(bulkDateCellIds, bulkInstalledOn\)/);
  assert.match(service, /if \(cellIds\.length < 2\)/);
  assert.match(service, /\.in\('id', cellIds\)/);
});

test("교체 날짜가 바뀌면 이전 날짜를 이력으로 남겨 품목에서 다시 확인한다", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20261106030000_liqud_stand_date_history.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /create table if not exists public\.liqud_stand_cell_date_history/);
  assert.match(migration, /before update of installed_on on public\.liqud_stand_cells/);
  assert.match(page, /이전 교체 날짜/);
  assert.match(service, /from\('liqud_stand_cell_date_history'\)/);
});
