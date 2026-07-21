import type { ItemType } from '../../_item/_types/item.types';

export type LiqudStandSettings = { id: number; blue_days: number; red_days: number };
export type LiqudStandCell = {
  id: string;
  section_id: string;
  row_index: number;
  column_index: number;
  item_name: string | null;
  secondary_item_name: string | null;
  consumable_type: string | null;
  installed_on: string | null;
  note: string | null;
  items: ItemType | null;
  secondary_item: ItemType | null;
};
export type LiqudStandSection = {
  id: string;
  name: string;
  row_count: number;
  column_count: number;
  sort_order: number;
  liqud_stand_cells: LiqudStandCell[];
};
