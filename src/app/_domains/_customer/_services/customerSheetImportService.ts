import supabase from "@/libs/supabaseClient";

export type CustomerSheetImportStatus =
  | "pending"
  | "matched"
  | "new_customer"
  | "hold"
  | "x_transfer"
  | "duplicate"
  | "applied";

export type CustomerSheetImportRowInput = {
  sourceRowNumber: number;
  storeName: string;
  soldAtText: string;
  itemName: string;
  paidAmountText: string;
  paymentMethod: string;
  customerName: string;
  customerPhone: string;
  customerNote: string;
  customerAddress: string;
};

export type CustomerSheetImportRow = CustomerSheetImportRowInput & {
  id: number;
  batchId: string;
  reviewStatus: CustomerSheetImportStatus;
  selectedCustomerId: number | null;
  reviewNote: string;
  proposedChanges: Record<string, unknown>;
};

const normalizeRow = (row: Record<string, unknown>): CustomerSheetImportRow => ({
  id: Number(row.id),
  batchId: String(row.batch_id),
  sourceRowNumber: Number(row.source_row_number),
  storeName: String(row.store_name ?? ""),
  soldAtText: String(row.sold_at_text ?? ""),
  itemName: String(row.item_name ?? ""),
  paidAmountText: String(row.paid_amount_text ?? ""),
  paymentMethod: String(row.payment_method ?? ""),
  customerName: String(row.customer_name ?? ""),
  customerPhone: String(row.customer_phone ?? ""),
  customerNote: String(row.customer_note ?? ""),
  customerAddress: String(row.customer_address ?? ""),
  reviewStatus: row.review_status as CustomerSheetImportStatus,
  selectedCustomerId:
    row.selected_customer_id === null || row.selected_customer_id === undefined
      ? null
      : Number(row.selected_customer_id),
  reviewNote: String(row.review_note ?? ""),
  proposedChanges:
    row.proposed_changes && typeof row.proposed_changes === "object"
      ? (row.proposed_changes as Record<string, unknown>)
      : {},
});

export const createCustomerSheetImportBatch = async (input: {
  title: string;
  sourceLabel: string;
  rows: CustomerSheetImportRowInput[];
}) => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("로그인이 필요합니다.");

  const { data: batch, error: batchError } = await supabase
    .from("customer_sheet_import_batches")
    .insert({
      title: input.title.trim() || "구글시트 고객 정리",
      source_label: input.sourceLabel.trim(),
      created_by: userData.user.id,
    })
    .select("id")
    .single();
  if (batchError) throw batchError;

  const batchId = String(batch.id);
  await appendCustomerSheetImportRows(batchId, input.rows);
  return batchId;
};

export const appendCustomerSheetImportRows = async (
  batchId: string,
  rows: CustomerSheetImportRowInput[],
) => {
  const payload = rows.map((row) => ({
    batch_id: batchId,
    source_row_number: row.sourceRowNumber,
    store_name: row.storeName,
    sold_at_text: row.soldAtText,
    item_name: row.itemName,
    paid_amount_text: row.paidAmountText,
    payment_method: row.paymentMethod,
    customer_name: row.customerName,
    customer_phone: row.customerPhone,
    customer_note: row.customerNote,
    customer_address: row.customerAddress,
  }));

  for (let index = 0; index < payload.length; index += 500) {
    const { error } = await supabase
      .from("customer_sheet_import_rows")
      .insert(payload.slice(index, index + 500));
    if (error) throw error;
  }
};

export const getCustomerSheetImportRows = async (batchId: string) => {
  const { data, error } = await supabase
    .from("customer_sheet_import_rows")
    .select("*")
    .eq("batch_id", batchId)
    .order("source_row_number", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => normalizeRow(row as Record<string, unknown>));
};

export const updateCustomerSheetImportRow = async (
  id: number,
  update: Pick<
    CustomerSheetImportRow,
    "reviewStatus" | "selectedCustomerId" | "reviewNote" | "proposedChanges"
  >,
) => {
  const { error } = await supabase
    .from("customer_sheet_import_rows")
    .update({
      review_status: update.reviewStatus,
      selected_customer_id: update.selectedCustomerId,
      review_note: update.reviewNote,
      proposed_changes: update.proposedChanges,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
};

export const deleteCustomerSheetImportRow = async (id: number) => {
  const { error } = await supabase.from("customer_sheet_import_rows").delete().eq("id", id);
  if (error) throw error;
};

export type CustomerSheetImportApplyResult = {
  appliedRows: number;
  duplicateRows: number;
  heldRows: number;
};

/** 검토 완료 행만 DB 함수에서 한 번에 반영한다. 클라이언트는 고객·이력을 직접 수정하지 않는다. */
export const applyCustomerSheetImportBatch = async (batchId: string) => {
  const { data, error } = await supabase.rpc("apply_customer_sheet_import_batch", {
    p_batch_id: batchId,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return {
    appliedRows: Number(result?.applied_rows ?? 0),
    duplicateRows: Number(result?.duplicate_rows ?? 0),
    heldRows: Number(result?.held_rows ?? 0),
  } satisfies CustomerSheetImportApplyResult;
};

export type CustomerSheetImportCandidate = {
  id: number;
  name: string;
  phone: string;
  gender: string | null;
  address: string | null;
  note: string | null;
};

export const getCustomerSheetImportCandidates = async () => {
  const customers: CustomerSheetImportCandidate[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("customers")
      .select("id,name,phone,gender,address,note")
      .range(from, from + 999)
      .order("id", { ascending: true });
    if (error) throw error;
    customers.push(...((data ?? []) as CustomerSheetImportCandidate[]));
    if (!data || data.length < 1000) return customers;
  }
};
