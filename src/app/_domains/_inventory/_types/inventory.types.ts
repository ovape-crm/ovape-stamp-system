import { ItemType } from '../../_item/_types/item.types';

export type InventoryType = {
  id: string;
  items_id: string;
  quantity: number;
};

export type InventoryItemType = ItemType & {
  inventory_quantity: number;
};
