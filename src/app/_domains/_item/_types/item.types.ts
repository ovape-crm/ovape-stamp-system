export type ItemCategoryType = {
  id: string;
  name: string;
  order_index: number;
  created_at: string;
};

export type ItemType = {
  id: string;
  category_id: string | null;
  item_code: string;
  item_name: string;
  purchase_price: number | null;
  selling_price: number | null;
  liquid_type: string | null;
  liquid_flavor: string | null;
  note: string | null;
  is_use: boolean;
  created_at: string;
  updated_at: string;
  current_quantity?: number;
  item_categories: ItemCategoryType | null;
  liqud_stand_cells?: Array<{
    row_index: number;
    column_index: number;
    liqud_stand_sections: { name: string } | null;
  }>;
};
