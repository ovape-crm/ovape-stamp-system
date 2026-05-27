import supabase from '@/libs/supabaseClient';
import { InboundOrderType } from '../_types/inbound.types';

type InboundFiltersParam = {
  dateFrom?: string;
  dateTo?: string;
  itemName?: string;
};

const ORDER_SELECT = `
  id, partner_id, order_date, inbound_date, note, created_at,
  partners(id, name),
  inbound_order_items(
    id, item_id, quantity, is_quantity_confirmed, is_inventory_processed,
    processed_at, note,
    items(id, item_code, item_name)
  )
`;

const findOrderIdsByItemName = async (itemName: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('inbound_order_items')
    .select('inbound_order_id, items!inner(id)')
    .ilike('items.item_name', `%${itemName}%`);

  if (error) throw error;
  return Array.from(
    new Set(
      (data ?? []).map((r) => r.inbound_order_id as string).filter(Boolean),
    ),
  );
};

export const getInboundOrders = async (
  limit: number,
  offset: number,
  filters?: InboundFiltersParam,
): Promise<InboundOrderType[]> => {
  let orderIdsFilter: string[] | null = null;

  if (filters?.itemName?.trim()) {
    orderIdsFilter = await findOrderIdsByItemName(filters.itemName.trim());
    if (orderIdsFilter.length === 0) return [];
  }

  let query = supabase
    .from('inbound_orders')
    .select(ORDER_SELECT)
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.dateFrom) query = query.gte('order_date', filters.dateFrom);
  if (filters?.dateTo) query = query.lte('order_date', filters.dateTo);
  if (orderIdsFilter) query = query.in('id', orderIdsFilter);

  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as InboundOrderType[];
};

export const getInboundOrdersCount = async (
  filters?: InboundFiltersParam,
): Promise<number> => {
  let orderIdsFilter: string[] | null = null;

  if (filters?.itemName?.trim()) {
    orderIdsFilter = await findOrderIdsByItemName(filters.itemName.trim());
    if (orderIdsFilter.length === 0) return 0;
  }

  let query = supabase
    .from('inbound_orders')
    .select('*', { count: 'exact', head: true });

  if (filters?.dateFrom) query = query.gte('order_date', filters.dateFrom);
  if (filters?.dateTo) query = query.lte('order_date', filters.dateTo);
  if (orderIdsFilter) query = query.in('id', orderIdsFilter);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
};

export const createInboundOrder = async (values: {
  partnerId: string;
  orderDate: string;
  note: string | null;
  items: {
    itemId: string;
    quantity: number;
    note: string | null;
  }[];
}): Promise<void> => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('세션을 찾을 수 없습니다');
  }

  const adminId = session.user.id;

  const { data, error } = await supabase
    .from('inbound_orders')
    .insert({
      partner_id: values.partnerId,
      order_date: values.orderDate,
      note: values.note,
    })
    .select('id')
    .single();

  if (error) throw error;

  const orderId = data?.id;
  if (!orderId) {
    throw new Error('입고 주문 생성에 실패했습니다.');
  }

  const { error: itemError } = await supabase.from('inbound_order_items').insert(
    values.items.map((item) => ({
      inbound_order_id: orderId,
      item_id: item.itemId,
      admin_id: adminId,
      quantity: item.quantity,
      note: item.note,
      is_quantity_confirmed: false,
      is_inventory_processed: false,
    })),
  );

  if (itemError) throw itemError;
};

export const updateInboundOrderItemQuantityConfirmed = async (
  itemId: string,
  isConfirmed: boolean,
): Promise<void> => {
  const { error } = await supabase
    .from('inbound_order_items')
    .update({
      is_quantity_confirmed: isConfirmed,
    })
    .eq('id', itemId);

  if (error) throw error;
};

export const processInboundOrderItemInventory = async (values: {
  inboundOrderId: string;
  inboundOrderItemId: string;
  itemId: string;
  quantity: number;
}): Promise<{ processedAt: string }> => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('세션을 찾을 수 없습니다');
  }

  const adminId = session.user.id;
  const processedAt = new Date().toISOString();
  const inboundDate = processedAt.slice(0, 10);

  const { data: inboundItem, error: inboundItemError } = await supabase
    .from('inbound_order_items')
    .select('is_inventory_processed, is_quantity_confirmed')
    .eq('id', values.inboundOrderItemId)
    .single();

  if (inboundItemError) throw inboundItemError;

  if (inboundItem.is_inventory_processed) {
    throw new Error('이미 재고 반영이 완료된 품목입니다.');
  }

  if (!inboundItem.is_quantity_confirmed) {
    throw new Error('수량 확인 후 재고를 반영해주세요.');
  }

  const { data: inventoryRow, error: inventoryFetchError } = await supabase
    .from('items_inventory')
    .select('id, quantity')
    .eq('items_id', values.itemId)
    .maybeSingle();

  if (inventoryFetchError) throw inventoryFetchError;

  if (inventoryRow) {
    const { error: inventoryUpdateError } = await supabase
      .from('items_inventory')
      .update({
        quantity: (inventoryRow.quantity ?? 0) + values.quantity,
      })
      .eq('id', inventoryRow.id);

    if (inventoryUpdateError) throw inventoryUpdateError;
  } else {
    const { error: inventoryInsertError } = await supabase
      .from('items_inventory')
      .insert({
        items_id: values.itemId,
        quantity: values.quantity,
      });

    if (inventoryInsertError) throw inventoryInsertError;
  }

  const { error: inboundOrderItemUpdateError } = await supabase
    .from('inbound_order_items')
    .update({
      is_inventory_processed: true,
      processed_at: processedAt,
      admin_id: adminId,
    })
    .eq('id', values.inboundOrderItemId);

  if (inboundOrderItemUpdateError) throw inboundOrderItemUpdateError;

  const { error: inboundOrderUpdateError } = await supabase
    .from('inbound_orders')
    .update({
      inbound_date: inboundDate,
      updated_at: processedAt,
    })
    .eq('id', values.inboundOrderId);

  if (inboundOrderUpdateError) throw inboundOrderUpdateError;

  return { processedAt };
};
