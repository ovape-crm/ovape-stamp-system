export type ManualTopCategoryType = {
  id: string;
  tab: string;
  name: string;
  order_index: number;
  is_use: boolean;
  created_at: string;
  updated_at: string;
};

export type ManualSubCategoryType = {
  id: string;
  top_category_id: string;
  name: string;
  order_index: number;
  is_use: boolean;
  created_at: string;
  updated_at: string;
};

export type ManualType = {
  id: string;
  sub_category_id: string;
  title: string;
  content: string;
  order_index: number;
  is_use: boolean;
  created_at: string;
  updated_at: string;
  manual_sub_categories:
    | (ManualSubCategoryType & {
        manual_top_categories: ManualTopCategoryType | null;
      })
    | null;
};

export type ManualCategoryTree = {
  topCategories: ManualTopCategoryType[];
  subCategoriesByTop: Record<string, ManualSubCategoryType[]>;
};
