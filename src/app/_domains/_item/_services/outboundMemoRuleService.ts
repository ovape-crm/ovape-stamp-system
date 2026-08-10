import supabase from "@/libs/supabaseClient";
import type {
  OutboundMemoRule,
  OutboundMemoRuleInput,
} from "../_types/outboundMemoRule.types";

export const outboundMemoRuleKey = ["items", "outbound-memo-rules"] as const;

const ruleSelect =
  "id, target_type, category_id, item_id, message, placeholder_message, auto_select_memo, applicable_outbound_types, is_required, is_active, created_at, updated_at, item_categories(name), items(item_name)";

export const getOutboundMemoRules = async (): Promise<OutboundMemoRule[]> => {
  const { data, error } = await supabase
    .from("outbound_memo_rules")
    .select(ruleSelect)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as OutboundMemoRule[];
};

export const saveOutboundMemoRule = async (
  values: OutboundMemoRuleInput,
  id?: string,
): Promise<void> => {
  const payload = {
    target_type: values.targetType,
    category_id: values.targetType === "category" ? values.targetId : null,
    item_id: values.targetType === "item" ? values.targetId : null,
    message: values.message.trim(),
    placeholder_message: values.placeholderMessage.trim() || null,
    auto_select_memo: values.autoSelectMemo,
    applicable_outbound_types: values.applicableOutboundTypes,
    is_required: values.isRequired,
    is_active: values.isActive,
    updated_at: new Date().toISOString(),
  };

  const query = id
    ? supabase.from("outbound_memo_rules").update(payload).eq("id", id)
    : supabase.from("outbound_memo_rules").insert(payload);
  const { error } = await query;
  if (error) throw error;
};

export const deleteOutboundMemoRule = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from("outbound_memo_rules")
    .delete()
    .eq("id", id);
  if (error) throw error;
};
