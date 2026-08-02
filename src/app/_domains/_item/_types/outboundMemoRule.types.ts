export type OutboundMemoRuleTargetType = "category" | "item";
export type OutboundMemoRuleOutboundType =
  "standard" | "service" | "exchange_in" | "exchange_out" | "price_adjust";

export type OutboundMemoRule = {
  id: string;
  target_type: OutboundMemoRuleTargetType;
  category_id: string | null;
  item_id: string | null;
  message: string;
  auto_select_memo: boolean;
  applicable_outbound_types: OutboundMemoRuleOutboundType[];
  is_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  item_categories: { name: string } | null;
  items: { item_name: string } | null;
};

export type OutboundMemoRuleInput = {
  targetType: OutboundMemoRuleTargetType;
  targetId: string;
  message: string;
  autoSelectMemo: boolean;
  applicableOutboundTypes: OutboundMemoRuleOutboundType[];
  isRequired: boolean;
  isActive: boolean;
};
