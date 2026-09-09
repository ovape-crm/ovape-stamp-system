import supabase from '@/libs/supabaseClient';

export type TaxInvoiceOption = { id: string; name: string; is_active: boolean; sort_order: number };

export const getTaxInvoiceOptions = async (includeInactive = false) => {
  let query = supabase.from('inventory_tax_invoice_options').select('id, name, is_active, sort_order').order('sort_order').order('name');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TaxInvoiceOption[];
};

export const saveTaxInvoiceOption = async (name: string) => {
  const { error } = await supabase.from('inventory_tax_invoice_options').insert({ name: name.trim() });
  if (error) throw error;
};

export const deactivateTaxInvoiceOption = async (id: string) => {
  const { error } = await supabase.from('inventory_tax_invoice_options').update({ is_active: false }).eq('id', id);
  if (error) throw error;
};
