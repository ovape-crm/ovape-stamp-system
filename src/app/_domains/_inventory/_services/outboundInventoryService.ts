import supabase from '@/libs/supabaseClient';
import type { StampLogItem } from '@/app/_domains/_stamp/_services/stampService';
import {
  confirmInventoryShortage,
  type InventoryShortage,
} from '@/app/_domains/_inventory/_components/InventoryShortageConfirmDialog';

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
  return confirmInventoryShortage(shortages);
};
