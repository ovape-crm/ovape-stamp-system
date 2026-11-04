import supabase from '@/libs/supabaseClient';
import type { LiquidSalePriceRule } from '../_types/liquidSalePriceRule.types';

export const liquidSalePriceRuleKey = ['items', 'liquid-sale-price-rules'] as const;
export const legacyLiquidSalePriceRuleKey = ['items', 'liquid-sale-price-rules'] as const;

export type LegacyLiquidSalePriceRule = {
  id: string;
  breath_type: 'mtl' | 'dtl';
  event_quantity: number;
  basic_quantity: number;
  sale_price: number;
};

export const getLegacyLiquidSalePriceRules = async (): Promise<LegacyLiquidSalePriceRule[]> => {
  const { data, error } = await supabase
    .from('liquid_sale_price_rules')
    .select('id, breath_type, event_quantity, basic_quantity, sale_price')
    .order('breath_type')
    .order('event_quantity')
    .order('basic_quantity');
  if (error) throw error;
  return (data ?? []) as LegacyLiquidSalePriceRule[];
};

export const getLiquidSalePriceRules = async (): Promise<LiquidSalePriceRule[]> => {
  const { data, error } = await supabase.from('liquid_sale_price_rules').select('id, breath_type, event_quantity, basic_quantity, sale_price').order('breath_type').order('event_quantity').order('basic_quantity');
  if (error) throw error;
  return (data ?? []) as LiquidSalePriceRule[];
};

export const saveLiquidSalePriceRule = async (values: Omit<LiquidSalePriceRule, 'id'> & { id?: string }) => {
  const payload = { breath_type: values.breath_type, event_quantity: values.event_quantity, basic_quantity: values.basic_quantity, sale_price: values.sale_price };
  const { error } = values.id ? await supabase.from('liquid_sale_price_rules').update(payload).eq('id', values.id) : await supabase.from('liquid_sale_price_rules').insert(payload);
  if (error) throw error;
};

export const deleteLiquidSalePriceRule = async (id: string) => {
  const { error } = await supabase.from('liquid_sale_price_rules').delete().eq('id', id);
  if (error) throw error;
};

export type LiquidSaleExtraBottlePrice = { breath_type: 'mtl' | 'dtl'; sale_kind: 'event' | 'basic'; additional_bottle_price: number };
export const liquidSaleExtraBottlePriceKey = ['items', 'liquid-sale-extra-bottle-prices'] as const;
export const getLiquidSaleExtraBottlePrices = async (): Promise<LiquidSaleExtraBottlePrice[]> => {
  const { data, error } = await supabase.from('liquid_sale_extra_bottle_prices').select('breath_type, sale_kind, additional_bottle_price');
  if (error) throw error;
  return (data ?? []) as LiquidSaleExtraBottlePrice[];
};
export const saveLiquidSaleExtraBottlePrice = async (value: LiquidSaleExtraBottlePrice) => {
  const { error } = await supabase.from('liquid_sale_extra_bottle_prices').upsert(value, { onConflict: 'breath_type,sale_kind' });
  if (error) throw error;
};
