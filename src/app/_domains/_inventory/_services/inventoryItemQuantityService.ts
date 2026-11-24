import supabase from "@/libs/supabaseClient";

type ItemIdentity = {
  id: string | number;
  item_name: string;
};

const normalizeItemName = (value: string) => value.normalize("NFC").trim();

const chunk = <T,>(values: T[], size = 200) => {
  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
};

/**
 * 현재 품목명과 이름 변경 전 재고명을 모두 현재 품목 ID에 귀속해 수량을 합산한다.
 * 재고 원장은 과거 품목명을 보존하고, 화면은 현재 품목 마스터의 이름·코드를
 * 표시해야 하므로 모든 품목 검색 화면에서 이 조회를 공통으로 사용한다.
 */
export const getInventoryQuantitiesByItemId = async (
  items: ItemIdentity[],
): Promise<Map<string, number>> => {
  const itemIds = [...new Set(items.map((item) => String(item.id)))];
  if (!itemIds.length) return new Map();

  const linkResults = await Promise.all(
    chunk(itemIds).map((itemIdBatch) =>
      supabase
        .from("inventory_renewal_item_links")
        .select("legacy_item_name,item_id")
        .in("item_id", itemIdBatch),
    ),
  );
  for (const result of linkResults) {
    if (result.error) {
      throw new Error("재고 연결 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
    }
  }
  const linkRows = linkResults.flatMap((result) => result.data ?? []);

  const itemIdByName = new Map<string, string>(
    items.map((item) => [normalizeItemName(item.item_name), String(item.id)]),
  );
  for (const link of linkRows ?? []) {
    itemIdByName.set(
      normalizeItemName(link.legacy_item_name),
      String(link.item_id),
    );
  }

  const balanceResults = await Promise.all(
    chunk([...itemIdByName.keys()]).map((itemNameBatch) =>
      supabase
        .from("inventory_balances")
        .select("item_name, quantity")
        .in("item_name", itemNameBatch),
    ),
  );
  for (const result of balanceResults) {
    if (result.error) {
      throw new Error("재고 잔량을 불러오지 못했습니다. 다시 검색해 주세요.");
    }
  }
  const balanceRows = balanceResults.flatMap((result) => result.data ?? []);

  const quantitiesByItemId = new Map<string, number>();
  for (const balance of balanceRows ?? []) {
    const itemId = itemIdByName.get(normalizeItemName(balance.item_name));
    if (!itemId) continue;
    quantitiesByItemId.set(
      itemId,
      (quantitiesByItemId.get(itemId) ?? 0) + Number(balance.quantity),
    );
  }
  return quantitiesByItemId;
};
