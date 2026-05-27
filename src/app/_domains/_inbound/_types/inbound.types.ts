export type InboundOrderItemType = {
  id: string;
  item_id: string;
  quantity: number;
  is_quantity_confirmed: boolean;
  is_inventory_processed: boolean;
  processed_at: string | null;
  note: string | null;
  items: {
    id: string;
    item_code: string;
    item_name: string;
  } | null;
};

export type InboundOrderType = {
  id: string;
  partner_id: string;
  order_date: string;
  inbound_date: string | null;
  note: string | null;
  created_at: string;
  partners: {
    id: string;
    name: string;
  } | null;
  inbound_order_items: InboundOrderItemType[];
};
