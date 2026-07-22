import supabase from '@/libs/supabaseClient';
import type { StampLogItem } from '@/app/_domains/_stamp/_services/stampService';

type InventoryShortage = {
  item_name: string;
  current_quantity: number;
  requested_quantity: number;
  resulting_quantity: number;
};

export const confirmOutboundInventory = async (
  items: StampLogItem[] = [],
  logId?: string,
) => {
  const { data, error } = await supabase.rpc('preview_outbound_inventory', {
    p_items: items,
    p_log_id: logId ?? null,
  });
  if (error) throw error;

  const shortages = (data ?? []) as InventoryShortage[];
  if (shortages.length === 0) return true;

  const details = shortages
    .map(
      (row) =>
        `${row.item_name}: 현재 ${row.current_quantity}개 / 출고 ${row.requested_quantity}개 / 처리 후 ${row.resulting_quantity}개`,
    )
    .join('\n');
  return window.confirm(
    `재고가 부족한 품목이 있습니다.\n\n${details}\n\n그래도 출고 처리하시겠습니까?`,
  );
};
